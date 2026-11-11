import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoDriverGender, GoDriverPhoneChangeStatus, GoLanguage } from '@/generated/prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import { E164, E164_MSG, normalizeE164 } from '../../auth/phone';

export class UpdateDriverProfileDto {
  @ApiPropertyOptional({
    enum: GoLanguage,
    enumName: 'GoLanguage',
    example: GoLanguage.AR,
    description: 'App UI language (push / inbox). Uppercase AR | EN only. Omitted = no change.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @ValidateIf((o: UpdateDriverProfileDto) => o.preferred_language !== undefined)
  @IsIn(Object.values(GoLanguage), { message: 'must be AR or EN' })
  preferred_language?: GoLanguage;
}

export class RequestDriverPhoneChangeDto {
  @ApiProperty({ example: '+963933333333', description: 'New E.164 phone. Local 09… is accepted and stored as +963…' })
  @Transform(({ value }) => normalizeE164(value))
  @Matches(E164, { message: E164_MSG })
  phone!: string;
}

export class ConfirmDriverPhoneChangeDto {
  @ApiProperty({ example: '+963933333333', description: 'Same new phone from the request step' })
  @Transform(({ value }) => normalizeE164(value))
  @Matches(E164, { message: E164_MSG })
  phone!: string;

  @ApiProperty({ example: '123456', description: '6 digits. In dev mode always OTP_DEV_CODE (123456)' })
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class UploadDriverAvatarDto {
  @ApiProperty({ description: 'Base64 JPEG/PNG/WebP, data URL prefix allowed, max 2 MB decoded' })
  @IsString()
  @MinLength(1)
  @MaxLength(3_000_000)
  image!: string;
}

export class DriverPhoneChangePendingDto {
  @ApiProperty()
  request_id!: string;

  @ApiProperty({ enum: GoDriverPhoneChangeStatus, enumName: 'GoDriverPhoneChangeStatus' })
  status!: GoDriverPhoneChangeStatus;

  @ApiProperty({ example: '+9639****3333', description: 'Masked requested phone' })
  requested_phone!: string;

  @ApiProperty()
  created_at!: string;
}

export class DriverPhoneChangeConfirmResultDto {
  @ApiProperty({ example: 'PENDING_APPROVAL' })
  status!: 'PENDING_APPROVAL';

  @ApiProperty()
  request_id!: string;

  @ApiProperty({ example: '+9639****3333' })
  requested_phone!: string;

  @ApiProperty()
  created_at!: string;
}

export class RejectDriverPhoneChangeDto {
  @ApiPropertyOptional({ example: 'رقم غير مطابق للهوية', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class PhoneChangeRequestListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: GoDriverPhoneChangeStatus,
    enumName: 'GoDriverPhoneChangeStatus',
    example: GoDriverPhoneChangeStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(GoDriverPhoneChangeStatus)
  status?: GoDriverPhoneChangeStatus;

  @ApiPropertyOptional({ description: 'Branch filter (global roles only)' })
  @IsOptional()
  @IsString()
  branch_id?: string;
}

export class DriverProfileDto {
  @ApiProperty({ enum: GoDriverGender, enumName: 'GoDriverGender' })
  gender!: GoDriverGender;

  @ApiProperty({ enum: GoLanguage, enumName: 'GoLanguage', example: GoLanguage.AR })
  preferred_language!: GoLanguage;

  @ApiPropertyOptional({
    example: '/api/v1/go/driver/profile/avatar?v=1760000000000',
    nullable: true,
    description: 'Relative; needs the driver Bearer token',
  })
  avatar_url!: string | null;

  @ApiPropertyOptional({ example: 4.8, nullable: true, description: 'Null when the driver has no ratings yet' })
  rating_avg!: number | null;

  @ApiProperty({ example: 12 })
  rating_count!: number;

  @ApiPropertyOptional({ example: '+963922222222', nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ example: 'أحمد السائق', nullable: true })
  full_name!: string | null;

  @ApiPropertyOptional({
    type: DriverPhoneChangePendingDto,
    nullable: true,
    description: 'Pending phone-change request awaiting staff approval, if any',
  })
  phone_change_request!: DriverPhoneChangePendingDto | null;
}
