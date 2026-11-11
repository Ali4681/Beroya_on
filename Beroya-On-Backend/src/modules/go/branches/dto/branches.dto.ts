import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';

export class BranchListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  active_only?: boolean;
}

export class CreateBranchDto {
  @ApiProperty({ example: 'HOMS' })
  @IsString()
  @Matches(/^[A-Z0-9_]{2,32}$/, { message: 'code must be 2-32 uppercase letters/digits/underscore' })
  code: string;

  @ApiProperty({ example: 'حمص' })
  @IsString()
  @MaxLength(120)
  name_ar: string;

  @ApiPropertyOptional({ example: 'Homs' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_en?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    description: 'GeoJSON Polygon or MultiPolygon (coordinates as [lng, lat])',
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [36.2, 33.4],
          [36.4, 33.4],
          [36.4, 33.6],
          [36.2, 33.6],
          [36.2, 33.4],
        ],
      ],
    },
  })
  @IsOptional()
  @IsObject()
  service_area?: Record<string, unknown>;
}

export class UpdateBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_ar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name_en?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsObject()
  service_area?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    example: 33.5138,
    nullable: true,
    description: 'Branch centre for the distance bonus. Null = use the service-area centroid.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  center_lat?: number | null;

  @ApiPropertyOptional({ example: 36.2765, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  center_lng?: number | null;
}

export class ResolveBranchDto {
  @ApiProperty({ example: 33.5138 })
  @Type(() => Number)
  @IsNumber()
  lat: number;

  @ApiProperty({ example: 36.2765 })
  @Type(() => Number)
  @IsNumber()
  lng: number;
}
