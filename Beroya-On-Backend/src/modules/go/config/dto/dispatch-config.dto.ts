import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DRIVER_OFFER_RADIUS_MAX_M,
  DRIVER_OFFER_RADIUS_MIN_M,
} from '../../dispatch/offer-radius';

export class UpdateDispatchConfigDto {
  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  batch_size?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  batch_timeout_seconds?: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  max_search_radius_m?: number;

  @ApiPropertyOptional({ example: [500, 700, 800, 1000, 1200, 1300] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  radius_steps_json?: number[];

  @ApiPropertyOptional({
    example: 500,
    description:
      'Fixed driver offer / map-circle radius in meters (Option A). ' +
      'Dispatch only offers within this distance of pickup; exposed on GET /driver/config.',
    minimum: DRIVER_OFFER_RADIUS_MIN_M,
    maximum: DRIVER_OFFER_RADIUS_MAX_M,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(DRIVER_OFFER_RADIUS_MIN_M)
  @Max(DRIVER_OFFER_RADIUS_MAX_M)
  driver_offer_radius_m?: number;

  @ApiPropertyOptional({
    example: 90,
    description:
      'Minimum seconds to keep a ride in SEARCHING before FAILED_NO_DRIVER when no drivers are in range. ' +
      'Exposed to the customer app as searching_until while status is SEARCHING.',
    minimum: 1,
    maximum: 600,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  min_search_seconds?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Seconds between empty-candidate SEARCH_TICK retries while under min_search_seconds.',
    minimum: 1,
    maximum: 60,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  empty_search_retry_seconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  busy_driver_max_eta_sec?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  scheduled_busy_to_pickup_max_eta_sec?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  scheduled_required_early_arrival_sec?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pickup_arrival_radius_m?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stale_location_seconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  long_stop_seconds?: number;

  @ApiPropertyOptional({ example: 300, description: 'Max meters off planned route before MAJOR_ROUTE_DEVIATION' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(50)
  route_deviation_max_m?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  scheduled_reminder_seconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  scheduled_online_required_seconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  scheduled_late_tolerance_seconds?: number;
}
