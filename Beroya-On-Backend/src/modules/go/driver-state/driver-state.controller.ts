import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { DriverLocationBatchDto, DriverLocationDto } from '../rides/dto/rides.dto';
import { DriverStateService } from './driver-state.service';

@ApiBearerAuth()
@ApiTags('Driver')
@Controller('driver')
@Roles(GoRole.DRIVER)
export class DriverStateController {
  constructor(private readonly state: DriverStateService) {}

  @Get('availability')
  @ApiOperation({
    summary: 'Current driver availability state',
    description:
      'Server may force OFFLINE via socket `driver.forced_offline` `{ "reason": "WALLET_DUE" }` ' +
      '(wallet due). Re-check eligibility before going online again.',
  })
  get(@CurrentUser() user: AuthUser) {
    return this.state.getState(user.id);
  }

  @Post('availability/online')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Go online (Ticket §6.2) — eligibility required' })
  @ApiGoErrors(E.DRIVER_NOT_ELIGIBLE, E.UNAUTHORIZED)
  online(@CurrentUser() user: AuthUser) {
    return this.state.goOnline(user);
  }

  @Post('availability/offline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Go offline (Ticket §6.3)' })
  offline(@CurrentUser() user: AuthUser) {
    return this.state.goOffline(user);
  }

  @Post('location')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Live location update → Redis + DB snapshot (Ticket §6.4)' })
  location(@CurrentUser() user: AuthUser, @Body() dto: DriverLocationDto) {
    return this.state.updateLocation(user, dto);
  }

  @Post('location/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Offline location sync batch (Ticket §6.5)' })
  batch(@CurrentUser() user: AuthUser, @Body() dto: DriverLocationBatchDto) {
    return this.state.updateLocationBatch(user, dto);
  }
}
