import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { OtpRequestedDto } from '../auth/dto/auth.dto';
import { DriverProfileService } from './driver-profile.service';
import {
  ConfirmDriverPhoneChangeDto,
  DriverPhoneChangeConfirmResultDto,
  DriverPhoneChangePendingDto,
  DriverProfileDto,
  RequestDriverPhoneChangeDto,
  UpdateDriverProfileDto,
  UploadDriverAvatarDto,
} from './dto/driver-profile.dto';

@ApiBearerAuth()
@ApiTags('Driver')
@Controller('driver/profile')
@Roles(GoRole.DRIVER)
export class DriverProfileController {
  constructor(private readonly profiles: DriverProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Own driver profile fields (also merged into GET /auth/me)' })
  @ApiOkResponse({ type: DriverProfileDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.ACCOUNT_NOT_FOUND)
  me(@CurrentUser() user: AuthUser) {
    return this.profiles.getMe(user.id);
  }

  @Idempotent()
  @Patch()
  @ApiOperation({
    summary: 'Update own driver profile fields (preferred_language)',
    description:
      'Requires Idempotency-Key. Partial body — currently `preferred_language: AR | EN` (uppercase). ' +
      'Invalid value → VALIDATION_ERROR with errors[].field = preferred_language. ' +
      'Returns updated profile (same shape as GET /driver/profile). Also mirrored on GET /auth/me. ' +
      'Push / inbox copy uses this language.',
  })
  @ApiOkResponse({ type: DriverProfileDto })
  @ApiGoErrors(
    E.UNAUTHORIZED,
    E.ROLE_NOT_ALLOWED,
    E.VALIDATION_ERROR,
    E.ACCOUNT_NOT_FOUND,
    E.IDEMPOTENCY_KEY_REQUIRED,
    E.IDEMPOTENCY_KEY_REUSED,
  )
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateDriverProfileDto) {
    return this.profiles.updateMe(user.id, dto);
  }

  @Post('phone/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request OTP to change own phone',
    description: 'Sends OTP to the new number (purpose DRIVER_PHONE_CHANGE). Same cooldown / rate limits as login OTP.',
  })
  @ApiOkResponse({ type: OtpRequestedDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.CONFLICT, E.OTP_RESEND_TOO_SOON, E.RATE_LIMITED)
  requestPhone(@CurrentUser() user: AuthUser, @Body() dto: RequestDriverPhoneChangeDto) {
    return this.profiles.requestPhoneChange(user, dto.phone);
  }

  @Post('phone/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm phone change OTP → pending staff approval',
    description:
      'Verifies OTP for the new number and creates a PENDING phone-change request. ' +
      'Does **not** update User.phone until staff approve. Returns PENDING_APPROVAL payload. ' +
      'Current phone on GET /driver/profile stays unchanged until approval.',
  })
  @ApiOkResponse({ type: DriverPhoneChangeConfirmResultDto })
  @ApiGoErrors(
    E.UNAUTHORIZED,
    E.ROLE_NOT_ALLOWED,
    E.VALIDATION_ERROR,
    E.CONFLICT,
    E.OTP_INVALID,
    E.OTP_EXPIRED,
    E.OTP_TOO_MANY_ATTEMPTS,
  )
  confirmPhone(@CurrentUser() user: AuthUser, @Body() dto: ConfirmDriverPhoneChangeDto) {
    return this.profiles.confirmPhoneChange(user, dto.phone, dto.code);
  }

  @Get('phone/change-request')
  @ApiOperation({
    summary: 'Current pending phone-change request',
    description: 'Returns pending request { request_id, status, requested_phone (masked), created_at } or null.',
  })
  @ApiOkResponse({ type: DriverPhoneChangePendingDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.ACCOUNT_NOT_FOUND)
  phoneChangeRequest(@CurrentUser() user: AuthUser) {
    return this.profiles.getPhoneChangeRequest(user.id);
  }

  @Delete('phone/change-request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel own pending phone-change request' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.ACCOUNT_NOT_FOUND)
  cancelPhoneChangeRequest(@CurrentUser() user: AuthUser) {
    return this.profiles.cancelPhoneChangeRequest(user);
  }

  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload or replace own avatar (base64 JPEG/PNG/WebP, max 2 MB)' })
  @ApiOkResponse({ type: DriverProfileDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.ACCOUNT_NOT_FOUND)
  uploadAvatar(@CurrentUser() user: AuthUser, @Body() dto: UploadDriverAvatarDto) {
    return this.profiles.setAvatar(user.id, dto.image);
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Remove own avatar' })
  @ApiOkResponse({ type: DriverProfileDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.ACCOUNT_NOT_FOUND)
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.profiles.removeAvatar(user.id);
  }

  @Get('avatar')
  @Header('Cache-Control', 'private, max-age=86400')
  @ApiOperation({ summary: 'Own avatar image (use avatar_url from /auth/me or /driver/profile)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  async avatar(@CurrentUser() user: AuthUser) {
    const file = await this.profiles.readAvatar(user.id);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }
}
