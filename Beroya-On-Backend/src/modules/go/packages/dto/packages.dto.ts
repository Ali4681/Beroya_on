import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreatePackageDto {
  @ApiProperty({ example: 'باقة الشهر' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name_ar!: string;

  @ApiPropertyOptional({ example: 'Monthly pack' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name_en?: string;

  @ApiPropertyOptional({ example: '10 رحلات يومي خلال 30 يوم' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description_ar?: string;

  @ApiPropertyOptional({ example: '10 Daily rides within 30 days' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description_en?: string;

  @ApiProperty({ example: 50000, description: 'SYP' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiProperty({ example: 30, minimum: 1, maximum: 365 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  duration_days!: number;

  @ApiPropertyOptional({ example: 10, description: 'Rides included. Send this, discount_percentage, or both.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  ride_count?: number;

  @ApiPropertyOptional({ example: 15, description: 'Percent off each ride during the package' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  discount_percentage?: number;

  @ApiPropertyOptional({ description: 'JPEG, PNG, or WebP bytes encoded as base64 (max 2 MB)' })
  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(2_800_000)
  image?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdatePackageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name_ar?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name_en?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description_ar?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description_en?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  duration_days?: number;

  @ApiPropertyOptional({ nullable: true, description: 'null removes it; the package must keep rides or a discount' })
  @ValidateIf((o: UpdatePackageDto) => o.ride_count !== undefined && o.ride_count !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  ride_count?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'null removes it; the package must keep rides or a discount' })
  @ValidateIf((o: UpdatePackageDto) => o.discount_percentage !== undefined && o.discount_percentage !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  discount_percentage?: number | null;

  @ApiPropertyOptional({ description: 'Replace the image: JPEG, PNG, or WebP bytes encoded as base64 (max 2 MB)' })
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
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class PublicPackageDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'باقة الشهر' }) name_ar!: string;
  @ApiProperty({ example: 'Monthly pack', nullable: true }) name_en!: string | null;
  @ApiProperty({ nullable: true }) description_ar!: string | null;
  @ApiProperty({ nullable: true }) description_en!: string | null;
  @ApiProperty({ example: 50000 }) price!: number;
  @ApiProperty({ example: 'SYP' }) currency!: string;
  @ApiProperty({ example: 30 }) duration_days!: number;
  @ApiProperty({ example: 10, nullable: true }) ride_count!: number | null;
  @ApiProperty({ example: 15, nullable: true }) discount_percentage!: number | null;
  @ApiProperty({
    nullable: true,
    example: '/api/v1/go/customer/packages/<id>/image?v=1760263200000',
    description: 'Relative to the API host. null when no image was uploaded.',
  })
  image_url!: string | null;
  @ApiProperty({ example: 0 }) sort_order!: number;
}

export class AdminPackageDto extends PublicPackageDto {
  @ApiProperty() is_active!: boolean;
  @ApiProperty() created_at!: Date;
  @ApiProperty() updated_at!: Date;
}
