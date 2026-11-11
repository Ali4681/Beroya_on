import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { GoRideStatus } from '@/generated/prisma/client';
import { RADAR_RESOLUTIONS, type RadarResolution } from '../radar-math';
import { RADAR_RIDE_STATUSES } from '../radar.service';

export class RadarQueryDto {
  @ApiPropertyOptional({ description: 'Global roles only; scoped staff stay on their branch.' })
  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @ApiPropertyOptional({ description: 'Window start (ISO). Default: `to` − 60 min.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Window end (ISO). Default: now. Max window 31 days.' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ enum: RADAR_RESOLUTIONS, default: 8, description: 'H3 display resolution: 7 ≈ district, 8 ≈ neighbourhood.' })
  @IsOptional()
  @Type(() => Number)
  @IsIn([...RADAR_RESOLUTIONS])
  resolution?: RadarResolution;
}

export class RadarMapQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @ApiPropertyOptional({ description: 'Viewport south edge. Send all four bounds or none.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  min_lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  min_lng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  max_lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  max_lng?: number;
}

export class RadarRidesQueryDto extends RadarMapQueryDto {
  @ApiPropertyOptional({ enum: RADAR_RIDE_STATUSES })
  @IsOptional()
  @IsIn(RADAR_RIDE_STATUSES)
  status?: GoRideStatus;
}

export class DriverRadarQueryDto {
  @ApiPropertyOptional({
    description:
      'Driver / map center. Omit both to use the last reported location. ' +
      'Shared by GET /driver/radar and GET /driver/radar/peers.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ default: 5000, minimum: 500, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(500)
  @Max(10000)
  radius_m?: number;
}
