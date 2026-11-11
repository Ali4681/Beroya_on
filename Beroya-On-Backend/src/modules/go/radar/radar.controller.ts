import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { DriverRadarQueryDto, RadarMapQueryDto, RadarQueryDto, RadarRidesQueryDto } from './dto/radar.dto';
import { RadarService } from './radar.service';

/** Same roles as the live board and fleet map. Finance and wallet operators do not see positions. */
const RADAR_STAFF = [
  GoRole.CUSTOMER_SERVICE,
  GoRole.CUSTOMER_SERVICE_SUPERVISOR,
  GoRole.OPERATIONS,
  GoRole.ADMIN,
  GoRole.SUPER_ADMIN,
] as const;

@ApiBearerAuth()
@Controller()
export class RadarController {
  constructor(private readonly radar: RadarService) {}

  @Get('erp/radar/cells')
  @Roles(...RADAR_STAFF)
  @ApiTags('ERP')
  @ApiOperation({
    summary: 'Radar: demand, supply, waiting requests and forecast per H3 area',
    description:
      '`observed` counts requests in [from, to) and the previous equal window. `live` is now: waiting requests and drivers ' +
      '(available = ONLINE, no ride, location fresher than stale_location_seconds). `forecast` is the next hour, ' +
      'or null with `forecast.status = insufficient_data`. Cached 30 s.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  cells(@CurrentUser() user: AuthUser, @Query() q: RadarQueryDto) {
    return this.radar.staffSnapshot(user, q);
  }

  @Get('erp/radar/cells/:cell')
  @Roles(...RADAR_STAFF)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Radar: one area — totals, trend, hour-of-day / weekday profile, waiting requests' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  cell(@CurrentUser() user: AuthUser, @Param('cell') cell: string, @Query() q: RadarQueryDto) {
    return this.radar.staffCell(user, cell, q);
  }

  @Get('erp/radar/drivers')
  @Roles(...RADAR_STAFF)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Radar layer: online / busy drivers with last location age and a stale flag' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  drivers(@CurrentUser() user: AuthUser, @Query() q: RadarMapQueryDto) {
    return this.radar.staffDrivers(user, q);
  }

  @Get('erp/radar/rides')
  @Roles(...RADAR_STAFF)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Radar layer: active rides and SEARCHING requests (no customer identity)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  rides(@CurrentUser() user: AuthUser, @Query() q: RadarRidesQueryDto) {
    return this.radar.staffRides(user, q);
  }

  @Get('driver/radar')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Driver Radar: demand areas near the driver and up to 3 suggested areas',
    description:
      'Same calculation as the desk map, aggregated only (no other drivers, customers or money). ' +
      '`recent_requests` = last 60 min; `waiting_requests` = searching now; `forecast_requests` = next hour or null ' +
      'when `forecast.status = insufficient_data`. Suggestions never change dispatch, price or commission ' +
      '(`notice: NO_GUARANTEE`). Max 30 calls per minute. Peer driver dots: GET /driver/radar/peers.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.RATE_LIMITED, E.ACCOUNT_NOT_FOUND)
  driver(@CurrentUser() user: AuthUser, @Query() q: DriverRadarQueryDto) {
    return this.radar.driverRadar(user, q);
  }

  @Get('driver/radar/peers')
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Nearby peer drivers (map dots) — last-known position + on_ride',
    description:
      'Privacy-redacted snapshot for the driver home map. Each item is `{ lat, lng, on_ride }` only — ' +
      'no driver_id, name, phone, plate, or ride_id. Excludes the caller and stale locations ' +
      '(older than `stale_location_seconds`). Same center/radius rules as GET /driver/radar. ' +
      'REST snapshot only (no socket). Max 30 calls per minute. ERP staff map remains GET /erp/radar/drivers.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.RATE_LIMITED, E.ACCOUNT_NOT_FOUND)
  driverPeers(@CurrentUser() user: AuthUser, @Query() q: DriverRadarQueryDto) {
    return this.radar.driverPeers(user, q);
  }
}
