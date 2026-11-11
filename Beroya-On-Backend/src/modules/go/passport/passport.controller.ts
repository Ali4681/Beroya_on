import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoPassportRewardGrantStatus, GoPassportRewardType, GoRole } from '@/generated/prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { PassportService } from './passport.service';

class GrantCustomerStampDto {
  @ApiProperty({ description: 'Passport level id whose stamp to grant' })
  @IsUUID()
  level_id!: string;
}

class CreateLevelDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) level_order!: number;
  @ApiProperty() @IsString() @MaxLength(120) name_ar!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name_en?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(40)
  stamp_name_ar?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(40)
  stamp_name_en?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() minimum_score?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) minimum_completed_rides?: number;
  @ApiPropertyOptional({ description: 'Stamp validity days (0 = none). Combine with duration_hours.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  duration_days?: number;
  @ApiPropertyOptional({ description: 'Stamp validity hours 0–23. Combine with duration_days.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  duration_hours?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
}

class UpdateLevelDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name_ar?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name_en?: string;
  @ApiPropertyOptional({
    description: 'Arabic stamp phrase on the customer passport (e.g. أنت استثنائي). Null or empty clears it.',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(40)
  stamp_name_ar?: string | null;
  @ApiPropertyOptional({
    description: 'English stamp phrase. Null or empty clears it.',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(40)
  stamp_name_en?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() minimum_score?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) minimum_completed_rides?: number;
  @ApiPropertyOptional({ description: 'Stamp validity days (0 = none). Combine with duration_hours.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  duration_days?: number;
  @ApiPropertyOptional({ description: 'Stamp validity hours 0–23. Combine with duration_days.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  duration_hours?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() icon_storage_key?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() icon?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
}

class UpdateConfigDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() initial_score?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() minimum_score?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() maximum_score?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) review_interval_minutes?: number;
}

class UpdateRuleDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() score_delta?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
}

class CreateMilestoneDto {
  @ApiProperty({ description: 'Consecutive completed rides at which this reward is given (each count is set on its own)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  milestone_multiple!: number;

  @ApiProperty({ enum: GoPassportRewardType })
  @IsIn(Object.values(GoPassportRewardType))
  reward_type!: GoPassportRewardType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  score_bonus?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discount_percentage?: number | null;

  @ApiPropertyOptional({ description: 'Hours the issued discount code stays valid (default 720 = 30 days, max 8760 = 365 days)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8760)
  discount_valid_hours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requires_admin_approval?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

class UpdateMilestoneDto {
  @ApiPropertyOptional({ description: 'Consecutive completed rides at which this reward is given' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  milestone_multiple?: number;

  @ApiPropertyOptional({ enum: GoPassportRewardType })
  @IsOptional()
  @IsIn(Object.values(GoPassportRewardType))
  reward_type?: GoPassportRewardType;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  score_bonus?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discount_percentage?: number | null;

  @ApiPropertyOptional({ description: 'Hours the issued discount code stays valid (max 8760 = 365 days)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8760)
  discount_valid_hours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requires_admin_approval?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

class UpdateStreakDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) milestone_every_rides?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
}

@ApiBearerAuth()
@Controller()
export class PassportController {
  constructor(private readonly passport: PassportService) {}

  @Get('customer/passport')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Customer passport view — no score (Ticket §23.9)',
    description:
      'Returns { level, current_streak, stamps, active_reward }. ' +
      'A stamp is each passport level reached at least once. ' +
      'active_reward is the best unused ACTIVE passport-linked discount (milestone or STAMP audience), or null. ' +
      'Same payload is emitted on `passport.updated`. Never includes hidden_score or points.',
  })
  customerView(@CurrentUser() user: AuthUser) {
    return this.passport.getCustomerView(user.id);
  }

  @Get('admin/passport/levels')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  levels() {
    return this.passport.listLevels();
  }

  @Post('admin/passport/levels')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Create a customer passport level (stamp)' })
  createLevel(@CurrentUser() user: AuthUser, @Body() dto: CreateLevelDto) {
    return this.passport.createLevel(user, dto);
  }

  @Get('admin/passport/levels/:levelId')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  getLevel(@Param('levelId', ParseUUIDPipe) levelId: string) {
    return this.passport.getLevel(levelId);
  }

  @Patch('admin/passport/levels/:levelId')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  updateLevel(
    @CurrentUser() user: AuthUser,
    @Param('levelId', ParseUUIDPipe) levelId: string,
    @Body() dto: UpdateLevelDto,
  ) {
    return this.passport.updateLevel(user, levelId, dto);
  }

  @Get('admin/passport/levels/:levelId/icon')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Customer passport level icon' })
  async adminLevelIcon(@Param('levelId', ParseUUIDPipe) levelId: string) {
    const file = await this.passport.readLevelIcon(levelId);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @Get('customer/passport/levels/:levelId/icon')
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Passport level icon for the customer app' })
  async customerLevelIcon(@Param('levelId', ParseUUIDPipe) levelId: string) {
    const file = await this.passport.readLevelIcon(levelId);
    return new StreamableFile(file.data, { type: file.mime, disposition: 'inline' });
  }

  @Get('admin/passport/config')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  config() {
    return this.passport.getConfig();
  }

  @Patch('admin/passport/config')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  updateConfig(@CurrentUser() user: AuthUser, @Body() dto: UpdateConfigDto) {
    return this.passport.updateConfig(user, dto);
  }

  @Get('admin/passport/score-rules')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  rules() {
    return this.passport.listScoreRules();
  }

  @Get('admin/passport/score-rules/:ruleId')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  getRule(@Param('ruleId', ParseUUIDPipe) ruleId: string) {
    return this.passport.getScoreRule(ruleId);
  }

  @Patch('admin/passport/score-rules/:ruleId')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  updateRule(
    @CurrentUser() user: AuthUser,
    @Param('ruleId', ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateRuleDto,
  ) {
    return this.passport.updateScoreRule(user, ruleId, dto);
  }

  @Get('admin/passport/streak-config')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  streak() {
    return this.passport.getStreakConfig();
  }

  @Patch('admin/passport/streak-config')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  updateStreak(@CurrentUser() user: AuthUser, @Body() dto: UpdateStreakDto) {
    return this.passport.updateStreakConfig(user, dto);
  }

  @Get('admin/passport/milestone-rewards')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  milestones() {
    return this.passport.listMilestoneRewards();
  }

  @Post('admin/passport/milestone-rewards')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Create a streak reward for an exact consecutive ride count' })
  createMilestone(@CurrentUser() user: AuthUser, @Body() dto: CreateMilestoneDto) {
    return this.passport.createMilestoneReward(user, dto);
  }

  @Delete('admin/passport/milestone-rewards/:id')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Delete a streak milestone reward' })
  deleteMilestone(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.passport.deleteMilestoneReward(user, id);
  }

  @Get('admin/passport/milestone-rewards/:id')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  getMilestone(@Param('id', ParseUUIDPipe) id: string) {
    return this.passport.getMilestoneReward(id);
  }

  @Patch('admin/passport/milestone-rewards/:id')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  updateMilestone(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.passport.updateMilestoneReward(user, id, dto);
  }

  @Get('admin/passport/reward-grants')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  grants(@Query('status') status?: GoPassportRewardGrantStatus) {
    return this.passport.listRewardGrants(status);
  }

  @Get('admin/passport/reward-grants/:id')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  getGrant(@Param('id', ParseUUIDPipe) id: string) {
    return this.passport.getRewardGrant(id);
  }

  @Post('admin/passport/reward-grants/:id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.passport.approveGrant(user, id);
  }

  @Post('admin/passport/reward-grants/:id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.passport.rejectGrant(user, id);
  }

  @Post('admin/passport/customers/:customerId/stamps')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Grant a passport stamp to a customer',
    description: 'Adds the stamp for the given passport level. Idempotent conflict if already held. Does not change current level.',
  })
  grantCustomerStamp(
    @CurrentUser() user: AuthUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: GrantCustomerStampDto,
  ) {
    return this.passport.grantStampToCustomer(user, customerId, dto.level_id);
  }
}
