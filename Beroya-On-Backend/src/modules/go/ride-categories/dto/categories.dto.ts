import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'ECONOMY' })
  @IsString()
  @Matches(/^[A-Z0-9_]{2,32}$/)
  code: string;

  @ApiProperty({ example: 'اقتصادي' })
  @IsString()
  @MaxLength(80)
  name_ar: string;

  @ApiPropertyOptional({ example: 'Economy' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name_en?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ example: 4, default: 4, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  max_passengers?: number;

  @ApiPropertyOptional({ description: 'Vehicle image: JPEG, PNG, or WebP bytes encoded as base64 (max 2 MB)' })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(2_800_000)
  image?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class PublicCategoryPricingDto {
  @ApiProperty({ example: '1000' }) base_fare: string;
  @ApiProperty({ example: '400' }) price_per_km: string;
  @ApiProperty({ example: '80' }) price_per_minute: string;
  @ApiProperty({ example: '2500' }) minimum_fare: string;
  @ApiProperty({ example: 'SYP' }) currency: string;
}

export class PublicCategoryDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'FAMILY' }) code: string;
  @ApiProperty({ example: 'عائلي' }) name_ar: string;
  @ApiProperty({ example: 'Family', nullable: true }) name_en: string | null;
  @ApiProperty({ example: 3 }) sort_order: number;
  @ApiProperty({ example: 6 }) max_passengers: number;
  @ApiProperty({
    nullable: true,
    example: '/api/v1/go/customer/ride-categories/<id>/image?v=1760263200000',
    description: 'Relative to the API host. null when no image was uploaded.',
  })
  image_url: string | null;
  @ApiProperty({ type: PublicCategoryPricingDto, nullable: true }) pricing: PublicCategoryPricingDto | null;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name_ar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name_en?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  max_passengers?: number;

  @ApiPropertyOptional({ description: 'Replace the vehicle image: JPEG, PNG, or WebP bytes encoded as base64 (max 2 MB)' })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(2_800_000)
  image?: string;

  @ApiPropertyOptional({ description: 'true deletes the current image' })
  @IsOptional()
  @IsBoolean()
  remove_image?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
