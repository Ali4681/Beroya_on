import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimmedOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

export class CreateCityDto {
  @ApiProperty({ example: 'حلب' })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name_ar!: string;

  @ApiPropertyOptional({ example: 'Aleppo', nullable: true })
  @IsOptional()
  @Transform(trimmedOrNull)
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(80)
  name_en?: string | null;

  @ApiPropertyOptional({ example: 36.2021, description: 'City / governorate centroid latitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ example: 37.1343, description: 'City / governorate centroid longitude' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ example: 1, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateCityDto {
  @ApiPropertyOptional({ example: 'حلب' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name_ar?: string;

  @ApiPropertyOptional({ example: 'Aleppo', nullable: true })
  @IsOptional()
  @Transform(trimmedOrNull)
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(80)
  name_en?: string | null;

  @ApiPropertyOptional({ example: 36.2021, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  lat?: number | null;

  @ApiPropertyOptional({ example: 37.1343, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  lng?: number | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sort_order?: number;

  @ApiPropertyOptional({ description: 'Deactivate instead of deleting (customers may still reference the city)' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class PublicCityDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: 'حلب' }) name_ar!: string;
  @ApiPropertyOptional({ example: 'Aleppo', nullable: true }) name_en!: string | null;
  @ApiPropertyOptional({ example: 36.2021, nullable: true, description: 'Centroid latitude for map / INTERCITY' })
  lat!: number | null;
  @ApiPropertyOptional({ example: 37.1343, nullable: true, description: 'Centroid longitude for map / INTERCITY' })
  lng!: number | null;
}

export class AdminCityDto extends PublicCityDto {
  @ApiProperty() sort_order!: number;
  @ApiProperty() is_active!: boolean;
  @ApiProperty() created_at!: Date;
  @ApiProperty() updated_at!: Date;
}
