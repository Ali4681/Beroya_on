import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES, STAFF_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { CreateCustomerDto } from '../drivers/dto/drivers.dto';
import { CustomersService } from './customers.service';
import { CustomerProfileDto, UpdateCustomerProfileDto, UploadCustomerAvatarDto } from './dto/customer-profile.dto';

class UpdateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  full_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  user_is_active?: boolean;
}

class ErpCustomersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Include soft-deleted accounts (Ticket §27). Default false.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  include_deleted?: boolean;
}

@Controller()
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @ApiBearerAuth()
  @Get('customer/profile')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Current customer Go profile (auto-created if missing)' })
  @ApiOkResponse({ type: CustomerProfileDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  me(@CurrentUser() user: AuthUser) {
    return this.customers.getMe(user.id);
  }

  @ApiBearerAuth()
  @Patch('customer/profile')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Update own personal data; only the fields sent are changed' })
  @ApiOkResponse({ type: CustomerProfileDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateCustomerProfileDto) {
    return this.customers.updateMe(user.id, dto);
  }

  @ApiBearerAuth()
  @Post('customer/profile/avatar')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Upload or replace own avatar (base64 JPEG/PNG/WebP, max 2 MB)' })
  @ApiOkResponse({ type: CustomerProfileDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  uploadAvatar(@CurrentUser() user: AuthUser, @Body() dto: UploadCustomerAvatarDto) {
    return this.customers.setAvatar(user.id, dto.image);
  }

  @ApiBearerAuth()
  @Delete('customer/profile/avatar')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Remove own avatar' })
  @ApiOkResponse({ type: CustomerProfileDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.customers.removeAvatar(user.id);
  }

  @ApiBearerAuth()
  @Idempotent()
  @Delete('customer/account')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Soft-delete own account (Ticket §27 / §17)',
    description:
      'No body. Requires Idempotency-Key. Blocks when an active ride or ACTIVE emergency exists (ACTIVE_RIDE_EXISTS). ' +
      'Clears PII, frees the phone for OTP re-registration, keeps rides for finance/legal.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.IDEMPOTENCY_KEY_REQUIRED, E.ACTIVE_RIDE_EXISTS, E.ACCOUNT_NOT_FOUND)
  deleteAccount(@CurrentUser() user: AuthUser) {
    return this.customers.deleteOwnAccount(user.id);
  }

  @ApiBearerAuth()
  @Get('customer/profile/avatar')
  @Roles(GoRole.CUSTOMER)
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Own avatar image (use avatar_url from the profile)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  async avatar(@CurrentUser() user: AuthUser) {
    const file = await this.customers.readAvatar(user.id);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @ApiBearerAuth()
  @Get('erp/customers')
  @Roles(...STAFF_ROLES)
  @ApiTags('ERP')
  @ApiOperation({
    summary: 'List customers',
    description: 'Soft-deleted accounts are hidden unless include_deleted=true.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  list(@CurrentUser() user: AuthUser, @Query() q: ErpCustomersQueryDto) {
    return this.customers.list(user, q.page, q.limit, q.branch_id, q.include_deleted === true);
  }

  @ApiBearerAuth()
  @Get('erp/customers/:customerId')
  @Roles(...STAFF_ROLES)
  @ApiTags('ERP')
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.BRANCH_SCOPE_DENIED)
  get(@CurrentUser() user: AuthUser, @Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.customers.get(user, customerId);
  }

  @ApiBearerAuth()
  @Patch('erp/customers/:customerId')
  @Roles(
    GoRole.CUSTOMER_SERVICE,
    GoRole.CUSTOMER_SERVICE_SUPERVISOR,
    GoRole.ADMIN,
    GoRole.SUPER_ADMIN,
  )
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Update customer notes; name and account status are admin-only' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(user, customerId, dto);
  }

  @ApiBearerAuth()
  @Post('admin/customers')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Create customer account + profile' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.CONFLICT)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customers.create(user, dto);
  }
}
