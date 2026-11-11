import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoDiscountAudience, GoRideType, GoRole, GoServiceCode } from '@/generated/prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { LatLngDto } from '../rides/dto/rides.dto';
import { DiscountsService } from './discounts.service';

const MAX_USES = 1_000_000;

/** Optional offer rules. Send null on PATCH to clear one. */
class DiscountCampaignDto {
  @ApiPropertyOptional({ nullable: true, example: 100, description: 'Only the first N distinct customers can use the code' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_USES)
  max_customers?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 1, description: 'Uses allowed per customer' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  per_customer_limit?: number | null;

  @ApiPropertyOptional({ description: 'Only customers without a completed ride' })
  @IsOptional() @IsBoolean()
  new_users_only?: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Governorate (branch); the pickup must be inside its service area' })
  @IsOptional() @IsUUID()
  branch_id?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'معرض دمشق الدولي' })
  @IsOptional() @IsString() @MaxLength(120)
  event_name?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'GeoJSON Polygon of the event venue; pickup or destination must be inside' })
  @IsOptional() @IsObject()
  event_area?: Record<string, unknown> | null;
}

class CreateDiscountDto extends DiscountCampaignDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Optional English display name' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_en?: string | null;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(32) code!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) percentage!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maximum_discount_amount?: number;
  @ApiProperty() @IsDateString() valid_from!: string;
  @ApiProperty() @IsDateString() expires_at!: string;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Total uses across all customers. Omit for no total cap; first-N codes default to max_customers × per_customer_limit.',
  })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_USES)
  usage_limit?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() immediate_allowed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() scheduled_allowed?: boolean;
  @ApiPropertyOptional({
    description: 'When false, the code is hidden from GET /customer/discount-codes until the customer redeems it',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  listed?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true })
  ride_category_ids?: string[];
  @ApiPropertyOptional({ enum: GoServiceCode, isArray: true, description: 'Services the code covers. Empty = DAILY only.' })
  @IsOptional() @IsArray() @IsEnum(GoServiceCode, { each: true })
  service_codes?: GoServiceCode[];
  @ApiPropertyOptional({ enum: GoDiscountAudience }) @IsOptional() @IsEnum(GoDiscountAudience) audience?: GoDiscountAudience;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true })
  customer_ids?: string[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() passport_level_id?: string;
}

class PatchDiscountDto extends DiscountCampaignDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ nullable: true, description: 'Optional English display name; null clears it' })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(120)
  name_en?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() percentage?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() maximum_discount_amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expires_at?: string;
  @ApiPropertyOptional({ nullable: true, description: 'Null removes the total cap' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_USES)
  usage_limit?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() immediate_allowed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() scheduled_allowed?: boolean;
  @ApiPropertyOptional({
    description: 'When false, the code is hidden from GET /customer/discount-codes until the customer redeems it',
  })
  @IsOptional()
  @IsBoolean()
  listed?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true })
  ride_category_ids?: string[];
  @ApiPropertyOptional({ enum: GoServiceCode, isArray: true, description: 'Replaces the linked services. [] = DAILY only.' })
  @IsOptional() @IsArray() @IsEnum(GoServiceCode, { each: true })
  service_codes?: GoServiceCode[];
  @ApiPropertyOptional({ enum: GoDiscountAudience }) @IsOptional() @IsEnum(GoDiscountAudience) audience?: GoDiscountAudience;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true })
  customer_ids?: string[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() passport_level_id?: string;
}

class RedeemDiscountDto {
  @ApiProperty({ example: 'BEROYA', description: 'As typed by the customer; case-insensitive. No ride fields.' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;
}

class CustomerDiscountsQueryDto {
  @ApiPropertyOptional({ enum: GoServiceCode, description: 'Only codes usable for this service (DAILY on the booking screen)' })
  @IsOptional()
  @IsEnum(GoServiceCode)
  service?: GoServiceCode;
}

class ValidateDiscountDto {
  @ApiProperty({ example: 'WELCOME10', description: 'As typed by the customer; case-insensitive' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;

  @ApiProperty() @IsUUID() ride_category_id!: string;

  @ApiProperty({ enum: GoRideType, enumName: 'GoRideType' }) @IsEnum(GoRideType) ride_type!: GoRideType;

  @ApiPropertyOptional({
    enum: GoServiceCode,
    enumName: 'GoServiceCode',
    default: GoServiceCode.DAILY,
    description: 'Must match the ride service_type (Ticket §29). Defaults to DAILY.',
  })
  @IsOptional()
  @IsEnum(GoServiceCode)
  service_type?: GoServiceCode;

  @ApiPropertyOptional({ example: 5000, description: 'When sent, discount_amount and final_fare are returned' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimated_fare?: number;

  @ApiPropertyOptional({ type: LatLngDto, description: 'Needed to check governorate and event codes' })
  @IsOptional()
  @ValidateNested()
  @Type(() => LatLngDto)
  pickup?: LatLngDto;

  @ApiPropertyOptional({ type: LatLngDto, description: 'Needed to check event codes' })
  @IsOptional()
  @ValidateNested()
  @Type(() => LatLngDto)
  destination?: LatLngDto;
}

class ValidateDiscountResponseDto {
  @ApiProperty({ description: 'Send as discount_code_id in POST /customer/rides' }) discount_code_id!: string;
  @ApiProperty({ example: 'WELCOME10' }) code!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ example: 10 }) percentage!: number;
  @ApiProperty({ nullable: true, example: 2000 }) maximum_discount_amount!: number | null;
  @ApiProperty({ nullable: true, example: 500 }) discount_amount!: number | null;
  @ApiProperty({ nullable: true, example: 4500 }) final_fare!: number | null;
}

const DISCOUNT_ERRORS = [
  E.DISCOUNT_CODE_INVALID,
  E.DISCOUNT_CODE_EXPIRED,
  E.DISCOUNT_CODE_NOT_ALLOWED_FOR_CATEGORY,
  E.DISCOUNT_CODE_NOT_ALLOWED_FOR_RIDE_TYPE,
  E.DISCOUNT_CODE_USAGE_EXHAUSTED,
  E.DISCOUNT_CODE_NEW_USERS_ONLY,
  E.DISCOUNT_CODE_NOT_ALLOWED_FOR_AREA,
  E.DISCOUNT_CODE_NOT_ALLOWED_FOR_SERVICE,
];

@ApiBearerAuth()
@Controller()
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Get('customer/discount-codes')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Available discount codes (Ticket §25.4 / §23)',
    description:
      'Listed codes plus codes the customer redeemed. Redeemed first (newest redeemed_at), then by expiry. Each item may include redeemed_at.',
  })
  mine(@CurrentUser() user: AuthUser, @Query() query: CustomerDiscountsQueryDto) {
    return this.discounts.listForCustomer(user.id, query.service);
  }

  @Post('customer/discount-codes/redeem')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Activate a typed discount code on the account (Ticket §23)',
    description:
      'No ride fields. Does not consume usage. Idempotent. Category / ride type / area are checked at booking.',
  })
  @ApiGoErrors(
    E.VALIDATION_ERROR,
    E.DISCOUNT_CODE_INVALID,
    E.DISCOUNT_CODE_EXPIRED,
    E.DISCOUNT_CODE_USAGE_EXHAUSTED,
    E.DISCOUNT_CODE_NEW_USERS_ONLY,
  )
  redeem(@CurrentUser() user: AuthUser, @Body() dto: RedeemDiscountDto) {
    return this.discounts.redeemForCustomer(user.id, dto.code);
  }

  @Post('customer/discount-codes/validate')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Check a typed code (public or personal) and price it on the server. Does not reserve it.',
  })
  @ApiOkResponse({ type: ValidateDiscountResponseDto })
  @ApiGoErrors(E.VALIDATION_ERROR, ...DISCOUNT_ERRORS)
  validate(@CurrentUser() user: AuthUser, @Body() dto: ValidateDiscountDto) {
    return this.discounts.validateForCustomer(user.id, {
      code: dto.code,
      rideCategoryId: dto.ride_category_id,
      rideType: dto.ride_type,
      serviceCode: dto.service_type,
      estimatedFare: dto.estimated_fare,
      area: { pickup: dto.pickup, destination: dto.destination },
    });
  }

  @Get('admin/discount-codes')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  list() {
    return this.discounts.adminList();
  }

  @Get('admin/discount-codes/:discountId')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  get(@Param('discountId', ParseUUIDPipe) discountId: string) {
    return this.discounts.adminGet(discountId);
  }

  @Post('admin/discount-codes')
  @HttpCode(HttpStatus.CREATED)
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDiscountDto) {
    return this.discounts.adminCreate(user, dto);
  }

  @Post('admin/customers/:customerId/discount-codes')
  @HttpCode(HttpStatus.CREATED)
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  createForCustomer(
    @CurrentUser() user: AuthUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateDiscountDto,
  ) {
    return this.discounts.adminCreate(user, {
      ...dto,
      audience: GoDiscountAudience.CUSTOMERS,
      customer_ids: [customerId],
    });
  }

  @Patch('admin/discount-codes/:discountId')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  patch(
    @CurrentUser() user: AuthUser,
    @Param('discountId', ParseUUIDPipe) discountId: string,
    @Body() dto: PatchDiscountDto,
  ) {
    return this.discounts.adminPatch(user, discountId, dto);
  }

  @Post('admin/discount-codes/:discountId/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  deactivate(@CurrentUser() user: AuthUser, @Param('discountId', ParseUUIDPipe) discountId: string) {
    return this.discounts.deactivate(user, discountId);
  }

  @Post('admin/discount-codes/:discountId/activate')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  activate(@CurrentUser() user: AuthUser, @Param('discountId', ParseUUIDPipe) discountId: string) {
    return this.discounts.activate(user, discountId);
  }

  @Delete('admin/discount-codes/:discountId')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Delete a discount code that was not used on rides' })
  remove(@CurrentUser() user: AuthUser, @Param('discountId', ParseUUIDPipe) discountId: string) {
    return this.discounts.adminRemove(user, discountId);
  }
}
