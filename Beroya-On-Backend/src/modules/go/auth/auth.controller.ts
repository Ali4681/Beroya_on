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
  Req,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Public, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES, DESK_LOGIN_ROLES, STAFF_ROLES } from '../../../common/auth/roles';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { AuthService } from './auth.service';
import {
  AuthTokensDto,
  ChangePasswordDto,
  OkDto,
  OtpRequestedDto,
  RefreshTokenDto,
  RequestOtpDto,
  StaffLoginDto,
  UserDto,
  VerifyOtpDto,
} from './dto/auth.dto';

const STAFF_PASSWORD = /^(?=.*[A-Za-z])(?=.*\d).+$/;

class UploadStaffAvatarDto {
  @ApiProperty({ description: 'Raw or data-URL base64 image' })
  @IsString()
  @MaxLength(8_000_000)
  data_base64!: string;
}

class CreateStaffDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(STAFF_PASSWORD, { message: 'Password must contain at least one letter and one digit' })
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  full_name!: string;

  @ApiProperty({ enum: STAFF_ROLES })
  @IsIn(STAFF_ROLES)
  role!: GoRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branch_id?: string;
}

class UpdateStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  full_name?: string;

  @ApiPropertyOptional({ enum: STAFF_ROLES })
  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: GoRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branch_id?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(STAFF_PASSWORD, { message: 'Password must contain at least one letter and one digit' })
  password?: string;
}

const clientCtx = (req: Request) => ({ ip: req.ip, user_agent: req.headers['user-agent'] });

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Customer/Driver: request login OTP',
    description:
      'CUSTOMER: any phone (account auto-created on verify). DRIVER: phone must belong to an onboarded driver. ' +
      'Cooldown between requests = resend_after_sec; max 10 requests/hour/phone.',
  })
  @ApiOkResponse({ type: OtpRequestedDto })
  @ApiGoErrors(E.VALIDATION_ERROR, E.ACCOUNT_NOT_FOUND, E.ACCOUNT_DISABLED, E.OTP_RESEND_TOO_SOON, E.RATE_LIMITED)
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer/Driver: verify OTP and receive tokens' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiGoErrors(E.VALIDATION_ERROR, E.OTP_INVALID, E.OTP_EXPIRED, E.OTP_TOO_MANY_ATTEMPTS, E.ACCOUNT_NOT_FOUND, E.ACCOUNT_DISABLED)
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.auth.verifyOtp(dto, clientCtx(req));
  }

  @Public()
  @Post('staff/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff (ERP/Admin dashboards): login with email or phone + password' })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiGoErrors(E.VALIDATION_ERROR, E.INVALID_CREDENTIALS, E.ACCOUNT_DISABLED, E.RATE_LIMITED)
  staffLogin(@Body() dto: StaffLoginDto, @Req() req: Request) {
    return this.auth.staffLogin(dto, clientCtx(req));
  }

  @Public()
  @Idempotent()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate tokens',
    description: 'Returns a NEW refresh_token; the old one stops working. Reusing an old refresh token revokes the session.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiGoErrors(
    E.VALIDATION_ERROR,
    E.REFRESH_TOKEN_INVALID,
    E.ACCOUNT_DISABLED,
    E.IDEMPOTENCY_KEY_REQUIRED,
    E.IDEMPOTENCY_KEY_REUSED,
    E.IDEMPOTENCY_IN_PROGRESS,
  )
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  @ApiBearerAuth()
  @Idempotent()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current session (this device)' })
  @ApiOkResponse({ type: OkDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.IDEMPOTENCY_KEY_REQUIRED, E.IDEMPOTENCY_KEY_REUSED, E.IDEMPOTENCY_IN_PROGRESS)
  logout(@CurrentUser() user: AuthUser) {
    return this.auth.logout(user);
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke all sessions of the current user (all devices)' })
  @ApiOkResponse({ type: OkDto })
  @ApiGoErrors(E.UNAUTHORIZED)
  logoutAll(@CurrentUser() user: AuthUser) {
    return this.auth.logoutAll(user);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user profile (any role)' })
  @ApiOkResponse({ type: UserDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ACCOUNT_DISABLED)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @ApiBearerAuth()
  @Roles(...DESK_LOGIN_ROLES)
  @Post('staff/change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff: change own password (revokes other sessions)' })
  @ApiOkResponse({ type: OkDto })
  @ApiGoErrors(E.VALIDATION_ERROR, E.UNAUTHORIZED, E.INVALID_CREDENTIALS, E.ROLE_NOT_ALLOWED)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto);
  }

  @ApiBearerAuth()
  @Roles(...DESK_LOGIN_ROLES)
  @Get('staff/avatar')
  @Header('Cache-Control', 'private, max-age=60')
  @ApiOperation({ summary: 'Staff: stream own profile photo' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  async staffAvatar(@CurrentUser() user: AuthUser) {
    const file = await this.auth.readStaffAvatar(user.id);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @ApiBearerAuth()
  @Roles(...DESK_LOGIN_ROLES)
  @Idempotent()
  @Post('staff/avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff: upload own profile photo (JPEG/PNG/WebP base64)' })
  @ApiOkResponse({ type: UserDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED)
  uploadStaffAvatar(@CurrentUser() user: AuthUser, @Body() dto: UploadStaffAvatarDto) {
    return this.auth.saveStaffAvatar(user, dto.data_base64);
  }

  @ApiBearerAuth()
  @Roles(...DESK_LOGIN_ROLES)
  @Delete('staff/avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff: remove own profile photo' })
  @ApiOkResponse({ type: UserDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  removeStaffAvatar(@CurrentUser() user: AuthUser) {
    return this.auth.removeStaffAvatar(user);
  }

  @ApiBearerAuth()
  @Get('admin/staff')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'List staff accounts' })
  listStaff(@Query() q: PaginationQueryDto) {
    return this.auth.listStaff(q.page, q.limit, q.branch_id);
  }

  @ApiBearerAuth()
  @Get('admin/staff/:userId')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Get a staff account' })
  getStaff(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.auth.getStaff(userId);
  }

  @ApiBearerAuth()
  @Post('admin/staff')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Create a staff account' })
  createStaff(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.auth.createStaff(user, dto);
  }

  @ApiBearerAuth()
  @Patch('admin/staff/:userId')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Update a staff account' })
  updateStaff(@CurrentUser() user: AuthUser, @Param('userId', ParseUUIDPipe) userId: string, @Body() dto: UpdateStaffDto) {
    return this.auth.updateStaff(user, userId, dto);
  }

  @ApiBearerAuth()
  @Get('admin/staff/:userId/sessions')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'List staff sessions' })
  sessions(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.auth.listSessions(userId);
  }

  @ApiBearerAuth()
  @Post('admin/staff/:userId/sessions/:sessionId/revoke')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Revoke one staff session' })
  revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.auth.revokeStaffSession(user, userId, sessionId);
  }
}
