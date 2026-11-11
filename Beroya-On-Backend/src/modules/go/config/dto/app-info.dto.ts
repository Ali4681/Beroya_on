import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { BRANDING_APPS } from '../../branding/branding.constants';

const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class UpdateAppInfoDto {
  @ApiPropertyOptional({ enum: BRANDING_APPS, description: 'Target app identity (also accepted as ?app=)' })
  @IsOptional()
  @IsIn([...BRANDING_APPS])
  app?: string;

  @ApiPropertyOptional({ nullable: true, example: '+963900000000' })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(32)
  support_phone?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '+963900000000', description: 'Phone or wa.me link' })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(64)
  support_whatsapp?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'support@beroyaon.com' })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null)
  @IsEmail()
  @MaxLength(254)
  support_email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(500)
  terms_url?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(500)
  privacy_url?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Arabic about text for the app' })
  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(4000)
  about_ar?: string | null;

  @ApiPropertyOptional({ example: '1.0.0', description: 'Apps below this should force-update' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^\d+\.\d+\.\d+([-.][\w.]+)?$/, { message: 'min_supported_version must look like 1.2.3' })
  min_supported_version?: string;

  @ApiPropertyOptional({ example: '1.2.0' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^\d+\.\d+\.\d+([-.][\w.]+)?$/, { message: 'latest_version must look like 1.2.3' })
  latest_version?: string;
}
