import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoDevicePlatform, GoDriverGender, GoLanguage, GoRole } from '@/generated/prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { E164, E164_MSG, normalizeE164 } from '../phone';

export { E164 };

export const OTP_APPS = ['CUSTOMER', 'DRIVER'] as const;
export type OtpApp = (typeof OTP_APPS)[number];

class DeviceInfoDto {
  @ApiPropertyOptional({ example: 'b3f1c2d4-device-uuid', description: 'Stable per-install device id' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  device_id?: string;

  @ApiPropertyOptional({ example: 'Samsung Galaxy S23' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  device_name?: string;

  @ApiPropertyOptional({ enum: GoDevicePlatform, enumName: 'GoDevicePlatform', example: GoDevicePlatform.ANDROID })
  @IsOptional()
  @IsEnum(GoDevicePlatform)
  platform?: GoDevicePlatform;
}

export class RequestOtpDto {
  @ApiProperty({ example: '+963911111111', description: 'E.164 format. A local 09… number is accepted and stored as +963…' })
  @Transform(({ value }) => normalizeE164(value))
  @Matches(E164, { message: E164_MSG })
  phone: string;

  @ApiProperty({ enum: OTP_APPS, example: 'CUSTOMER', description: 'Which app is logging in' })
  @IsIn(OTP_APPS)
  app: OtpApp;
}

export class VerifyOtpDto extends DeviceInfoDto {
  @ApiProperty({ example: '+963911111111' })
  @Transform(({ value }) => normalizeE164(value))
  @Matches(E164, { message: E164_MSG })
  phone: string;

  @ApiProperty({ enum: OTP_APPS, example: 'CUSTOMER' })
  @IsIn(OTP_APPS)
  app: OtpApp;

  @ApiProperty({ example: '123456', description: '6 digits. In dev mode always OTP_DEV_CODE (123456)' })
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code: string;
}

export class StaffLoginDto extends DeviceInfoDto {
  @ApiProperty({ example: 'superadmin@beroyaon.com', description: 'Email or E.164 phone' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  identifier: string;

  @ApiProperty({ example: 'Beroya@12345' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({ example: '6c1f...session-id.Zm9vYmFy...secret' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refresh_token: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'Beroya@12345' })
  @IsString()
  @IsNotEmpty()
  current_password: string;

  @ApiProperty({ example: 'NewStrong@2026', description: 'Min 8 chars, at least one letter and one digit' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'new_password must contain at least one letter and one digit' })
  new_password: string;
}

// ---------------- Responses ----------------

export class OtpRequestedDto {
  @ApiProperty({ example: true })
  sent: boolean;

  @ApiProperty({ example: 300 })
  expires_in_sec: number;

  @ApiProperty({ example: 60, description: 'Wait this long before requesting another code' })
  resend_after_sec: number;

  @ApiPropertyOptional({ example: '123456', description: 'Only returned when OTP_DEV_MODE=true' })
  dev_code?: string;
}

export class BranchSummaryDto {
  @ApiProperty({ example: 'a3b9...uuid' })
  id: string;

  @ApiProperty({ example: 'DAMASCUS' })
  code: string;

  @ApiProperty({ example: 'دمشق' })
  name_ar: string;

  @ApiPropertyOptional({ example: 'Damascus', nullable: true })
  name_en: string | null;
}

export class UserDto {
  @ApiProperty({ example: 'f0e1...uuid' })
  id: string;

  @ApiProperty({ enum: GoRole, enumName: 'GoRole', example: GoRole.CUSTOMER })
  role: GoRole;

  @ApiPropertyOptional({ example: '+963911111111', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: null, nullable: true, description: 'Staff login email; for customers, their profile email' })
  email: string | null;

  @ApiPropertyOptional({ example: 'Omar Customer', nullable: true })
  full_name: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  branch_id: string | null;

  @ApiPropertyOptional({ type: BranchSummaryDto, nullable: true })
  branch: BranchSummaryDto | null;

  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiPropertyOptional({ example: '2026-10-04T10:00:00.000Z', nullable: true })
  last_login_at: Date | null;

  @ApiProperty({ example: '2026-10-04T10:00:00.000Z' })
  created_at: Date;

  @ApiPropertyOptional({ example: 'uuid', nullable: true, description: 'Customers only' })
  city_id?: string | null;

  @ApiPropertyOptional({ example: 'دمشق', nullable: true, description: 'Customers only — city name_ar' })
  city?: string | null;

  @ApiPropertyOptional({
    enum: GoDriverGender,
    enumName: 'GoDriverGender',
    description: 'Customers and drivers',
  })
  gender?: GoDriverGender;

  @ApiPropertyOptional({ example: '1995-04-21', nullable: true, description: 'Customers only, YYYY-MM-DD' })
  date_of_birth?: string | null;

  @ApiPropertyOptional({ example: 'SYP', description: 'Customers only' })
  preferred_currency?: string;

  @ApiPropertyOptional({
    enum: GoLanguage,
    enumName: 'GoLanguage',
    description: 'App UI language — customers and drivers',
  })
  preferred_language?: GoLanguage;

  @ApiPropertyOptional({
    example: '/api/v1/go/auth/staff/avatar?v=1760000000000',
    nullable: true,
    description:
      'Relative path; needs the Bearer token. Staff → /auth/staff/avatar, customer → /customer/profile/avatar, driver → /driver/profile/avatar',
  })
  avatar_url?: string | null;

  @ApiPropertyOptional({
    example: 4.8,
    nullable: true,
    description: 'Drivers only — average of CUSTOMER_TO_DRIVER ratings; null when none',
  })
  rating_avg?: number | null;

  @ApiPropertyOptional({ example: 12, description: 'Drivers only — count of CUSTOMER_TO_DRIVER ratings' })
  rating_count?: number;
}

export class AuthTokensDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  access_token: string;

  @ApiProperty({ example: '6c1f...session-id.Zm9vYmFy...secret', description: 'Opaque. Rotated on every refresh' })
  refresh_token: string;

  @ApiProperty({ example: 'Bearer' })
  token_type: 'Bearer';

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds' })
  expires_in: number;

  @ApiProperty({ example: '2026-11-03T10:00:00.000Z' })
  refresh_expires_at: Date;

  @ApiProperty({ type: UserDto })
  user: UserDto;

  @ApiPropertyOptional({ example: true, description: 'OTP login only: account was just created' })
  is_new_user?: boolean;
}

export class OkDto {
  @ApiProperty({ example: true })
  success: boolean;
}