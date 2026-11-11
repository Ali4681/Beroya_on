import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { GoPerKmMode } from '../../../../generated/prisma/client';

export class UpdatePricingDto {
  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  base_fare?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price_per_km?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price_per_minute?: number;

  @ApiPropertyOptional({ example: 3000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimum_fare?: number;

  @ApiPropertyOptional({ example: 'SYP' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    enum: GoPerKmMode,
    description: 'AUTO: price_per_km follows fuel price changes. MANUAL: fixed. price_per_km stays editable in both.',
  })
  @IsOptional()
  @IsIn(Object.values(GoPerKmMode))
  per_km_mode?: GoPerKmMode;
}

export class FuelPriceDto {
  @ApiProperty({ example: 11000, description: 'New fuel price per litre.' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  new_price!: number;

  @ApiPropertyOptional({ example: 100, description: 'Share of per-km caused by fuel, percent. Saved when given.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  fuel_share_pct?: number;

  @ApiPropertyOptional({ example: 50, description: 'Round new per-km to the nearest multiple. 0 = no rounding.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rounding_step?: number;
}
