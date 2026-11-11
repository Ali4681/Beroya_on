import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoSavedPlaceKind } from '@/generated/prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimmedOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

export class CreateSavedPlaceDto {
  @ApiProperty({ example: 'المنزل', minLength: 1, maxLength: 60 })
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ enum: GoSavedPlaceKind, default: GoSavedPlaceKind.OTHER })
  @IsOptional()
  @IsEnum(GoSavedPlaceKind)
  kind?: GoSavedPlaceKind;

  @ApiProperty({ example: 33.5138 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 36.2765 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ example: 'دمشق، المزة', nullable: true, maxLength: 255 })
  @IsOptional()
  @Transform(trimmedOrNull)
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(255)
  address?: string | null;
}

export class UpdateSavedPlaceDto {
  @ApiPropertyOptional({ example: 'المنزل', minLength: 1, maxLength: 60 })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ enum: GoSavedPlaceKind })
  @IsOptional()
  @IsEnum(GoSavedPlaceKind)
  kind?: GoSavedPlaceKind;

  @ApiPropertyOptional({ example: 33.5138 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ example: 36.2765 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ example: 'دمشق، المزة', nullable: true, maxLength: 255 })
  @IsOptional()
  @Transform(trimmedOrNull)
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(255)
  address?: string | null;
}

export class SavedPlaceDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: GoSavedPlaceKind }) kind!: GoSavedPlaceKind;
  @ApiProperty() lat!: number;
  @ApiProperty() lng!: number;
  @ApiPropertyOptional({ nullable: true }) address!: string | null;
  @ApiProperty() created_at!: string;
  @ApiProperty() updated_at!: string;
}
