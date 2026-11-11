import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoDriverGender, GoLanguage } from '@/generated/prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CUSTOMER_CURRENCIES } from '../customer-profile.view';

const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimmedOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

export class UpdateCustomerProfileDto {
  @ApiPropertyOptional({ example: 'عمر الأحمد', minLength: 2, maxLength: 120 })
  @ValidateIf((o: UpdateCustomerProfileDto) => o.full_name !== undefined)
  @Transform(trimmed)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name?: string;

  @ApiPropertyOptional({ example: 'omar@example.com', nullable: true, description: 'null or "" clears it' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || null : value))
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({
    example: 'uuid',
    nullable: true,
    description: 'Preferred: city id from GET /customer/cities. null clears the link.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsUUID()
  city_id?: string | null;

  @ApiPropertyOptional({
    example: 'دمشق',
    nullable: true,
    maxLength: 80,
    description: 'Legacy free-text city (transitional). Prefer city_id.',
  })
  @IsOptional()
  @Transform(trimmedOrNull)
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(80)
  city?: string | null;

  @ApiPropertyOptional({ enum: GoDriverGender, enumName: 'GoDriverGender' })
  @ValidateIf((o: UpdateCustomerProfileDto) => o.gender !== undefined)
  @IsEnum(GoDriverGender)
  gender?: GoDriverGender;

  @ApiPropertyOptional({ example: '1995-04-21', nullable: true, description: 'YYYY-MM-DD, in the past, from 1900' })
  @IsOptional()
  @Transform(trimmedOrNull)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date_of_birth must be YYYY-MM-DD' })
  @IsDateString({ strict: true })
  date_of_birth?: string | null;

  @ApiPropertyOptional({ enum: CUSTOMER_CURRENCIES, example: 'SYP' })
  @ValidateIf((o: UpdateCustomerProfileDto) => o.preferred_currency !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(CUSTOMER_CURRENCIES)
  preferred_currency?: string;

  @ApiPropertyOptional({ enum: GoLanguage, enumName: 'GoLanguage', example: GoLanguage.AR })
  @ValidateIf((o: UpdateCustomerProfileDto) => o.preferred_language !== undefined)
  @IsEnum(GoLanguage)
  preferred_language?: GoLanguage;
}

export class UploadCustomerAvatarDto {
  @ApiProperty({ description: 'Base64 JPEG/PNG/WebP, data URL prefix allowed, max 2 MB decoded' })
  @IsString()
  @MinLength(1)
  @MaxLength(3_000_000)
  image!: string;
}

export class CustomerProfileUserDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) full_name!: string | null;
  @ApiProperty() is_active!: boolean;
  @ApiProperty() created_at!: Date;
}

export class CustomerProfileDto {
  @ApiProperty({ description: 'Customer profile id' }) id!: string;
  @ApiProperty() user_id!: string;
  @ApiPropertyOptional({ example: '+963911111111', nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ example: 'عمر الأحمد', nullable: true }) full_name!: string | null;
  @ApiPropertyOptional({ example: 'omar@example.com', nullable: true }) email!: string | null;
  @ApiPropertyOptional({ example: 'uuid', nullable: true }) city_id!: string | null;
  @ApiPropertyOptional({ example: 'دمشق', nullable: true, description: 'selected_city.name_ar (or legacy free text)' })
  city!: string | null;
  @ApiProperty({ enum: GoDriverGender, enumName: 'GoDriverGender', example: GoDriverGender.UNSPECIFIED })
  gender!: GoDriverGender;
  @ApiPropertyOptional({ example: '1995-04-21', nullable: true }) date_of_birth!: string | null;
  @ApiProperty({ enum: CUSTOMER_CURRENCIES, example: 'SYP' }) preferred_currency!: string;
  @ApiProperty({ enum: GoLanguage, enumName: 'GoLanguage', example: GoLanguage.AR })
  preferred_language!: GoLanguage;
  @ApiPropertyOptional({
    example: '/api/v1/go/customer/profile/avatar?v=1760000000000',
    nullable: true,
    description: 'Relative; needs the customer Bearer token',
  })
  avatar_url!: string | null;
  @ApiProperty() is_active!: boolean;
  @ApiProperty() created_at!: Date;
  @ApiProperty() updated_at!: Date;
  @ApiProperty({ type: CustomerProfileUserDto }) user!: CustomerProfileUserDto;
}
