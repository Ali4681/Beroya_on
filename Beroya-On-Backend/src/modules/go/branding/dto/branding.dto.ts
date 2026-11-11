import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ANIMATION_TYPES, APP_ICON_IDS, ASSET_SLOTS, BRANDING_APPS, HEX_COLOR } from '../branding.constants';

export class UpdateBrandingDraftDto {
  @ApiPropertyOptional({ enum: BRANDING_APPS, description: 'Target app identity (also accepted as ?app=)' })
  @IsOptional()
  @IsIn([...BRANDING_APPS])
  app?: string;

  @ApiPropertyOptional({ example: '#313193' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR)
  primary_color?: string;

  @ApiPropertyOptional({ example: '#25C5D1' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR)
  secondary_color?: string;

  @ApiPropertyOptional({ example: '#FFFFFF' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR)
  background_color?: string;

  @ApiPropertyOptional({ enum: ANIMATION_TYPES })
  @IsOptional()
  @IsIn([...ANIMATION_TYPES])
  splash_animation_type?: string;

  @ApiPropertyOptional({ example: 3000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(15000)
  splash_duration_ms?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  splash_animation_enabled?: boolean;

  @ApiPropertyOptional({ enum: APP_ICON_IDS })
  @IsOptional()
  @IsIn([...APP_ICON_IDS])
  selected_android_icon?: string;

  @ApiPropertyOptional({ enum: APP_ICON_IDS })
  @IsOptional()
  @IsIn([...APP_ICON_IDS])
  selected_ios_icon?: string;

  @ApiPropertyOptional({ enum: ASSET_SLOTS, description: 'Clear a draft asset by slot name' })
  @IsOptional()
  @IsIn([...ASSET_SLOTS])
  clear_slot?: string;
}

export class UploadBrandingAssetDto {
  @ApiPropertyOptional({ enum: BRANDING_APPS, description: 'Target app identity (also accepted as ?app=)' })
  @IsOptional()
  @IsIn([...BRANDING_APPS])
  app?: string;

  @ApiProperty({ enum: ASSET_SLOTS })
  @IsIn([...ASSET_SLOTS])
  slot: string;

  @ApiPropertyOptional({ example: 'logo.png' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  filename?: string;

  @ApiProperty({ description: 'Raw or data-URL base64' })
  @IsString()
  @MaxLength(8_000_000)
  data_base64: string;
}
