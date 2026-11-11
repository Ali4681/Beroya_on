import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { DriverStatisticsService } from './driver-statistics.service';
import { DriverStatisticsQueryDto } from './dto/driver-statistics.dto';

@ApiBearerAuth()
@ApiTags('Driver')
@Controller()
@Roles(GoRole.DRIVER)
export class DriverStatisticsController {
  constructor(private readonly stats: DriverStatisticsService) {}

  @Get('driver/statistics')
  @ApiOperation({
    summary: 'Driver statistics for day / week / month (إحصائيات)',
    description:
      'Server aggregates for the driver home stats screen. Calendar periods in the incentive timezone (default Asia/Damascus); ' +
      'weeks run Saturday→Friday (Figma). ' +
      '**Earnings:** gross = sum of commission base (gross_final_fare or customer_payable), fees = platform commission, ' +
      'net = gross − fees (invoice driver_earnings). series amounts are net. change_pct vs previous equal period (null if previous net was 0). ' +
      '**Acceptance:** ACCEPTED / (ACCEPTED + DECLINED + EXPIRED); offer timeouts count against the rate. ' +
      '**Rating:** CUSTOMER_TO_DRIVER in period; breakdown counts stars 5→1. ' +
      '**Score:** weighted average of customer_rating (avg/5×100) and acceptance_rate using incentive weight_rating / weight_acceptance; null if neither metric has data. ' +
      'Empty period → zeros / empty series (not 404). Pull-only — no socket.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.ACCOUNT_NOT_FOUND)
  get(@CurrentUser() user: AuthUser, @Query() q: DriverStatisticsQueryDto) {
    return this.stats.getForDriver(user.id, q.period, q.at);
  }
}
