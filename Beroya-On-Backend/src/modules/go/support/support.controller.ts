import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { GoRole, GoSupportMessageStatus } from '@/generated/prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { E164, E164_MSG, normalizeE164 } from '../auth/phone';
import { SupportService } from './support.service';

class CreateSupportMessageDto {
  @ApiProperty({ example: 'عمر الأحمد', minLength: 2, maxLength: 120 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name!: string;

  @ApiProperty({ example: '+963912345678' })
  @Transform(({ value }) => normalizeE164(value))
  @IsString()
  @Matches(E164, { message: E164_MSG })
  phone!: string;

  @ApiPropertyOptional({
    example: 'omar@example.com',
    nullable: true,
    maxLength: 254,
    description:
      'Optional. Omit, `null`, or `""` / whitespace — stored as null (empty string is stripped from the body). Invalid emails → VALIDATION_ERROR.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || null : value))
  @ValidateIf((_, v) => v != null)
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiProperty({
    example: 'أحتاج مساعدة بخصوص المحفظة والعمولة',
    minLength: 10,
    maxLength: 2000,
    description: 'Required. Fewer than 10 characters (after trim) → VALIDATION_ERROR on field `message`.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message!: string;
}

/** 201 body for POST /customer|driver/support/messages */
class SupportMessageCreatedDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'SUP-A1B2C3D4' })
  reference!: string;

  @ApiProperty({ enum: GoSupportMessageStatus, example: GoSupportMessageStatus.OPEN })
  status!: GoSupportMessageStatus;

  @ApiProperty({ example: '2026-10-19T11:00:00.000Z' })
  created_at!: Date;
}

class SupportMessagesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GoSupportMessageStatus })
  @IsOptional()
  @IsIn(Object.values(GoSupportMessageStatus))
  status?: GoSupportMessageStatus;

  @ApiPropertyOptional({ description: 'Filter created_at >= ISO date' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Filter created_at <= ISO date' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

class CustomerSupportListQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

class UpdateSupportMessageDto {
  @ApiPropertyOptional({ enum: [GoSupportMessageStatus.OPEN, GoSupportMessageStatus.IN_PROGRESS] })
  @IsOptional()
  @IsIn([GoSupportMessageStatus.OPEN, GoSupportMessageStatus.IN_PROGRESS])
  status?: GoSupportMessageStatus;

  @ApiPropertyOptional({ nullable: true, maxLength: 4000 })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(4000)
  reply?: string | null;
}

class CloseSupportMessageDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 4000 })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(4000)
  reply?: string | null;
}

@ApiBearerAuth()
@Controller()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Idempotent()
  @Post('customer/support/messages')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Send a general support message (Ticket §26)',
    description:
      'Requires Idempotency-Key. Max 5 messages/hour per customer → RATE_LIMITED.\n\n' +
      '**Success (201):** `{ id, reference, status, created_at }`.\n\n' +
      '**Validation (400 / VALIDATION_ERROR):** missing `full_name` / `phone` / `message`, ' +
      '`message` shorter than 10 chars after trim, invalid E.164 `phone`, or invalid `email`. ' +
      'Field details are in `errors[{ field, messages }]`.\n\n' +
      '**email:** optional — omit / null / blank → stored as null.',
  })
  @ApiCreatedResponse({ type: SupportMessageCreatedDto })
  @ApiGoErrors(E.VALIDATION_ERROR, E.RATE_LIMITED, E.IDEMPOTENCY_KEY_REQUIRED, E.IDEMPOTENCY_KEY_REUSED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSupportMessageDto) {
    return this.support.createByCustomer(user.id, dto);
  }

  @Get('customer/support/messages')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'List my support messages (Ticket §26 / §20)' })
  listMine(@CurrentUser() user: AuthUser, @Query() q: CustomerSupportListQueryDto) {
    return this.support.listMine(user.id, q.page, q.limit);
  }

  @Idempotent()
  @Post('driver/support/messages')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Send a general support message (driver home)',
    description:
      'Requires Idempotency-Key. Max 5 messages/hour per driver → RATE_LIMITED. Contact numbers also on GET /app/info.\n\n' +
      '**Success (201):** `{ id, reference, status, created_at }` ' +
      '(same shape as customer — not `{ ok: true }`).\n\n' +
      '**Validation (400 / VALIDATION_ERROR):** missing required fields, `message` < 10 chars after trim, ' +
      'invalid phone/email. Branch on `code === "VALIDATION_ERROR"` and `errors[].field` ' +
      '(`message`, `full_name`, `phone`, `email`) — there is no separate `MESSAGE_TOO_SHORT` code.\n\n' +
      '**email:** optional — omit / null / `""` → stripped to null before save.',
  })
  @ApiCreatedResponse({ type: SupportMessageCreatedDto })
  @ApiGoErrors(
    E.VALIDATION_ERROR,
    E.RATE_LIMITED,
    E.IDEMPOTENCY_KEY_REQUIRED,
    E.IDEMPOTENCY_KEY_REUSED,
    E.ACCOUNT_NOT_FOUND,
  )
  createDriver(@CurrentUser() user: AuthUser, @Body() dto: CreateSupportMessageDto) {
    return this.support.createByDriver(user.id, dto);
  }

  @Get('driver/support/messages')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({ summary: 'List my driver support messages' })
  listMineDriver(@CurrentUser() user: AuthUser, @Query() q: CustomerSupportListQueryDto) {
    return this.support.listMineDriver(user.id, q.page, q.limit);
  }

  @Get('erp/support-messages')
  @Roles(
    GoRole.CUSTOMER_SERVICE,
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.OPERATIONS,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  @ApiOperation({ summary: 'List support messages (filter by status / date)' })
  listErp(@Query() q: SupportMessagesQueryDto) {
    return this.support.listErp(q);
  }

  @Get('erp/support-messages/:id')
  @Roles(
    GoRole.CUSTOMER_SERVICE,
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.OPERATIONS,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.getErp(id);
  }

  @Post('erp/support-messages/:id/claim')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  claim(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.claim(user, id);
  }

  @Patch('erp/support-messages/:id')
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupportMessageDto,
  ) {
    return this.support.update(user, id, dto);
  }

  @Post('erp/support-messages/:id/close')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR)
  @ApiTags('ERP')
  close(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseSupportMessageDto,
  ) {
    return this.support.close(user, id, dto);
  }
}
