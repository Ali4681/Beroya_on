import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { GoIncentiveKind, GoRideBonusStack } from '@/generated/prisma/client';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpdateIncentiveConfigDto {
  @ApiPropertyOptional({ example: 'Asia/Damascus', description: 'IANA zone used for every "day" and "hour".' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ example: 1000, description: 'Rides shorter than this never count toward any incentive.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  min_counted_distance_m?: number;

  @ApiPropertyOptional({
    example: 2_000_000,
    nullable: true,
    description: 'Max total bonuses paid per day across all drivers. Null = no cap.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  daily_total_cap?: number | null;

  @ApiPropertyOptional({ description: 'Night fare surcharge on the customer.' })
  @IsOptional()
  @IsBoolean()
  night_fare_enabled?: boolean;

  @ApiPropertyOptional({ example: '00:00', description: 'HH:mm local time. May be after night_end (crosses midnight).' })
  @IsOptional()
  @Matches(HHMM, { message: 'night_start must be HH:mm' })
  night_start?: string;

  @ApiPropertyOptional({ example: '07:00', description: 'HH:mm local time, exclusive.' })
  @IsOptional()
  @Matches(HHMM, { message: 'night_end must be HH:mm' })
  night_end?: string;

  @ApiPropertyOptional({ example: 20, description: 'Percent added to the fare inside the window.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(200)
  night_fare_pct?: number;

  @ApiPropertyOptional({ type: [String], description: 'Ride categories with night fare. Empty = all.' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  night_category_ids?: string[];

  @ApiPropertyOptional({ description: 'Bonus on rides refused by many drivers.' })
  @IsOptional()
  @IsBoolean()
  rejection_enabled?: boolean;

  @ApiPropertyOptional({ example: 5, description: 'Distinct drivers who must refuse before the bonus applies.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  rejection_min_drivers?: number;

  @ApiPropertyOptional({ example: 15, description: 'Percent of the driver gross fare.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  rejection_pct?: number;

  @ApiPropertyOptional({ example: 10_000, nullable: true, description: 'Max bonus per ride. Null = no cap.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rejection_cap?: number | null;

  @ApiPropertyOptional({ description: 'Count expired (ignored) offers as refusals.' })
  @IsOptional()
  @IsBoolean()
  rejection_count_expired?: boolean;

  @ApiPropertyOptional({ description: 'Bonus on pickups far from the branch centre.' })
  @IsOptional()
  @IsBoolean()
  distance_enabled?: boolean;

  @ApiPropertyOptional({ example: 15, description: 'Minimum straight-line km from the branch centre to the pickup.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  distance_min_km?: number;

  @ApiPropertyOptional({ example: 10, description: 'Percent of the driver gross fare.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  distance_pct?: number;

  @ApiPropertyOptional({ example: 10_000, nullable: true, description: 'Max bonus per ride. Null = no cap.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  distance_cap?: number | null;

  @ApiPropertyOptional({ enum: GoRideBonusStack, description: 'MAX pays the larger bonus only; SUM pays both.' })
  @IsOptional()
  @IsEnum(GoRideBonusStack)
  ride_bonus_stack?: GoRideBonusStack;

  @ApiPropertyOptional({ description: 'Daily streak reward.' })
  @IsOptional()
  @IsBoolean()
  streak_enabled?: boolean;

  @ApiPropertyOptional({ example: 3, description: 'Completed rides in a row with no decline / driver cancel.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  streak_rides?: number;

  @ApiPropertyOptional({ example: 25_000, description: 'Paid once per incentive day.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  streak_amount?: number;

  @ApiPropertyOptional({ description: 'An offer left to expire breaks the streak.' })
  @IsOptional()
  @IsBoolean()
  streak_count_expired?: boolean;

  @ApiPropertyOptional({
    example: '00:00',
    description: 'Incentive day boundary (HH:mm). Day D runs from D at this time to D+1 at this time.',
  })
  @IsOptional()
  @Matches(HHMM, { message: 'daily_close_time must be HH:mm' })
  daily_close_time?: string;

  @ApiPropertyOptional({ example: 30, description: 'Driver score looks back this many incentive days.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  score_window_days?: number;

  @ApiPropertyOptional({ example: 30, description: 'Relative weight of the average customer rating.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weight_rating?: number;

  @ApiPropertyOptional({ example: 25, description: 'Relative weight of the offer acceptance rate.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weight_acceptance?: number;

  @ApiPropertyOptional({ example: 20, description: 'Relative weight of online hours (percentile in the branch).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weight_hours?: number;

  @ApiPropertyOptional({ example: 25, description: 'Relative weight of fares earned (percentile in the branch).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weight_earnings?: number;

  @ApiPropertyOptional({ example: 10, description: 'Points removed per 100% driver-cancel rate. 0 = ignored.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weight_cancel?: number;

  @ApiPropertyOptional({ example: 75, description: 'Score at or above = KEEP.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  band_keep?: number;

  @ApiPropertyOptional({ example: 50, description: 'Score at or above (and below band_keep) = WATCH; lower = REPLACEABLE.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  band_watch?: number;
}

export class CreateGoalCampaignDto {
  @ApiProperty({ example: 'هدف الليل' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: '22:00', description: 'HH:mm local.' })
  @Matches(HHMM, { message: 'start_time must be HH:mm' })
  start_time: string;

  @ApiProperty({ example: '00:00', description: 'HH:mm local, exclusive. Before start_time = crosses midnight.' })
  @Matches(HHMM, { message: 'end_time must be HH:mm' })
  end_time: string;

  @ApiPropertyOptional({ type: [Number], example: [4, 5], description: '0 = Sunday … 6 = Saturday (start day). Empty = every day.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days_of_week?: number[];

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  rides_required: number;

  @ApiProperty({ example: 50_000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  reward_amount: number;

  @ApiPropertyOptional({ nullable: true, description: 'Null = every branch.' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  branch_id?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateGoalCampaignDto extends PartialType(CreateGoalCampaignDto) {}

export class RunIncentivesDto {
  @ApiProperty({ enum: ['TICK', 'STREAK', 'CAMPAIGN'], description: 'TICK = what the minute job does now.' })
  @IsIn(['TICK', 'STREAK', 'CAMPAIGN'])
  job: 'TICK' | 'STREAK' | 'CAMPAIGN';

  @ApiPropertyOptional({ example: '2026-10-12', description: 'Day to settle. Default: the last ended day / window.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'day must be YYYY-MM-DD' })
  day?: string;

  @ApiPropertyOptional({ description: 'Required for job=CAMPAIGN.' })
  @IsOptional()
  @IsUUID()
  campaign_id?: string;

  @ApiPropertyOptional({ description: 'Re-run a settled period. Grants already paid are never paid twice.' })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class IncentiveGrantsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01', description: 'First local day (incentive timezone). Default: 29 days before `to`.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-10-13', description: 'Last local day, inclusive. Default: today.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ enum: GoIncentiveKind })
  @IsOptional()
  @IsEnum(GoIncentiveKind)
  kind?: GoIncentiveKind;

  @ApiPropertyOptional({ description: 'Driver profile id.' })
  @IsOptional()
  @IsUUID()
  driver_id?: string;
}

export class IncentiveRunsQueryDto {
  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ManualIncentiveGrantDto {
  @ApiProperty({ description: 'Driver profile id' })
  @IsUUID()
  driver_id!: string;

  @ApiProperty({ example: 25000, description: 'Amount in SYP credited to the driver wallet' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(50_000_000)
  amount!: number;

  @ApiPropertyOptional({ example: 'تعويض خاص', description: 'Optional note shown in the wallet reason and grant metadata' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
