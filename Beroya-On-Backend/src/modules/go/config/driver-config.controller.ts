import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import { Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { GoConfigService } from './config.service';

@ApiBearerAuth()
@ApiTags('Driver')
@Controller('driver/config')
@Roles(GoRole.DRIVER)
export class DriverConfigController {
  constructor(private readonly config: GoConfigService) {}

  @Get()
  @ApiOperation({
    summary: 'Driver operational config (offer / map-circle radius)',
    description:
      'Returns `driver_offer_radius_m` — the fixed radius (meters) used both to draw the home-map circle ' +
      'and to decide who receives ride offers (dispatch Option A). Same value as admin dispatch config. ' +
      'Not related to GET /driver/radar radius.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  get() {
    return this.config.getDriverConfig();
  }
}
