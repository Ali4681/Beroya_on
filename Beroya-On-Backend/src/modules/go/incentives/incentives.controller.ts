import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { DailyIncentivesService } from './daily-incentives.service';
import {
  CreateGoalCampaignDto,
  IncentiveGrantsQueryDto,
  IncentiveRunsQueryDto,
  ManualIncentiveGrantDto,
  RunIncentivesDto,
  UpdateGoalCampaignDto,
  UpdateIncentiveConfigDto,
} from './dto/incentives.dto';
import { GoalCampaignsService } from './goal-campaigns.service';
import { IncentiveGrantsService } from './incentive-grants.service';
import { IncentivesService } from './incentives.service';

@ApiBearerAuth()
@Controller()
export class IncentivesController {
  constructor(
    private readonly incentives: IncentivesService,
    private readonly daily: DailyIncentivesService,
    private readonly campaigns: GoalCampaignsService,
    private readonly grantsReport: IncentiveGrantsService,
  ) {}

  @Get('admin/incentives/config')
  @Roles(...ADMIN_ROLES, GoRole.FINANCE, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Driver incentive and night/fuel pricing settings' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  getConfig() {
    return this.incentives.getConfig();
  }

  @Patch('admin/incentives/config')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Update driver incentive settings (audited)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  updateConfig(@CurrentUser() user: AuthUser, @Body() dto: UpdateIncentiveConfigDto) {
    return this.incentives.updateConfig(user, dto);
  }

  @Get('admin/incentives/campaigns')
  @Roles(...ADMIN_ROLES, GoRole.FINANCE, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Goal campaigns with total paid' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  listCampaigns() {
    return this.campaigns.list();
  }

  @Post('admin/incentives/campaigns')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Create a goal campaign (audited)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  createCampaign(@CurrentUser() user: AuthUser, @Body() dto: CreateGoalCampaignDto) {
    return this.campaigns.create(user, dto);
  }

  @Get('admin/incentives/campaigns/:campaignId')
  @Roles(...ADMIN_ROLES, GoRole.FINANCE, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Goal campaign detail' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  getCampaign(@Param('campaignId', ParseUUIDPipe) id: string) {
    return this.campaigns.get(id);
  }

  @Patch('admin/incentives/campaigns/:campaignId')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Update a goal campaign (audited). Changes apply to windows not settled yet.' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.VALIDATION_ERROR)
  updateCampaign(
    @CurrentUser() user: AuthUser,
    @Param('campaignId', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoalCampaignDto,
  ) {
    return this.campaigns.update(user, id, dto);
  }

  @Delete('admin/incentives/campaigns/:campaignId')
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Delete a goal campaign. Paid grants are kept.' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND)
  deleteCampaign(@CurrentUser() user: AuthUser, @Param('campaignId', ParseUUIDPipe) id: string) {
    return this.campaigns.remove(user, id);
  }

  @Post('admin/incentives/run')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLES)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Run incentive jobs now (testing / recovery, audited)',
    description: 'STREAK settles a streak day, CAMPAIGN settles one campaign window, TICK runs the minute job.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.NOT_FOUND)
  run(@CurrentUser() user: AuthUser, @Body() dto: RunIncentivesDto) {
    return this.daily.run(user, dto);
  }

  @Get('admin/incentives/runs')
  @Roles(...ADMIN_ROLES, GoRole.FINANCE, GoRole.OPERATIONS)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Recent streak days and campaign windows with their results' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  runs(@Query() q: IncentiveRunsQueryDto) {
    return this.daily.listRuns(q.limit);
  }

  @Get('admin/incentives/grants')
  @Roles(...ADMIN_ROLES, GoRole.FINANCE, GoRole.OPERATIONS, GoRole.WALLET_OPERATOR)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Paid driver bonuses with totals',
    description:
      'Grants in [from, to] (local days in the incentive timezone), filtered by kind / driver / branch. ' +
      'Includes totals by kind, totals per day, and how many grants were skipped by the daily cap (cap_hits).',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.BRANCH_SCOPE_DENIED)
  grants(@CurrentUser() user: AuthUser, @Query() q: IncentiveGrantsQueryDto) {
    return this.grantsReport.report(user, q);
  }

  @Post('admin/incentives/grants/manual')
  @Roles(...ADMIN_ROLES, GoRole.FINANCE, GoRole.WALLET_OPERATOR)
  @ApiTags('Admin')
  @ApiOperation({
    summary: 'Pay a one-off bonus to a specific driver',
    description:
      'Credits the driver wallet immediately, records a MANUAL grant under paid incentives, and notifies the driver. ' +
      'Ignores the daily total cap. Each call is a new grant (not idempotent by amount).',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.NOT_FOUND, E.CONFLICT)
  grantManual(@CurrentUser() user: AuthUser, @Body() dto: ManualIncentiveGrantDto) {
    return this.incentives.grantManualBonus(user, dto);
  }

  @Get('driver/incentives/today')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: "Today's streak progress and goal campaigns",
    description: 'Streak: current run and longest run today. Goals: UPCOMING / ACTIVE / ENDED windows of the incentive day with rides completed.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.ACCOUNT_NOT_FOUND)
  today(@CurrentUser() user: AuthUser) {
    return this.daily.driverToday(user.id);
  }
}
