import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsISO8601, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CommandCenterQueryDto {
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
}

export class UpdateCommandCenterConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  alerts_enabled?: boolean;

  @ApiPropertyOptional({ description: 'Waiting requests in one area before coverage is checked.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  coverage_min_unassigned?: number;

  @ApiPropertyOptional({ description: 'Seconds an immediate request may stay SEARCHING before alerting.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(3600)
  assignment_delay_seconds?: number;

  @ApiPropertyOptional({ description: 'In-progress ride alerts after estimate × factor …' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(5)
  ride_delay_factor?: number;

  @ApiPropertyOptional({ description: '… and estimate + this many seconds.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(7200)
  ride_delay_min_extra_seconds?: number;

  @ApiPropertyOptional({ description: 'Cancelled ÷ finished, percent.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100)
  cancellation_rate_pct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(1440)
  cancellation_window_minutes?: number;

  @ApiPropertyOptional({ description: 'Minimum finished rides in the window before the rate is judged.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  cancellation_min_rides?: number;

  @ApiPropertyOptional({ description: 'An alert with the same key is not raised again inside this window.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  dedupe_minutes?: number;
}
