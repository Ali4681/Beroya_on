import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export const STATS_PERIODS = ['day', 'week', 'month'] as const;
export type StatsPeriodParam = (typeof STATS_PERIODS)[number];

export class DriverStatisticsQueryDto {
  @ApiProperty({ enum: STATS_PERIODS, example: 'week' })
  @IsIn([...STATS_PERIODS])
  period!: StatsPeriodParam;

  @ApiPropertyOptional({
    description: 'Anchor instant (ISO). Default = now. Period is the calendar day/week/month containing this time in Asia/Damascus (or incentive timezone).',
    example: '2026-11-02T12:00:00+03:00',
  })
  @IsOptional()
  @IsISO8601()
  at?: string;
}
