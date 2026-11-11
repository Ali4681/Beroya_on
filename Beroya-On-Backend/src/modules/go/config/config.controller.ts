import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { GoConfigService } from './config.service';
import { UpdateDispatchConfigDto } from './dto/dispatch-config.dto';

@ApiBearerAuth()
@ApiTags('Admin')
@Controller('admin/config')
@Roles(...ADMIN_ROLES)
export class GoConfigController {
  constructor(private readonly config: GoConfigService) {}

  @Get('dispatch')
  @ApiOperation({
    summary: 'Get operational dispatch config (Ticket §7.2)',
    description:
      'Includes `driver_offer_radius_m` (map circle / offer filter) and `min_search_seconds` / `empty_search_retry_seconds` ' +
      '(keep SEARCHING before FAILED_NO_DRIVER when the offer circle is empty). ' +
      '`radius_steps_json` / `max_search_radius_m` are retained for admin visibility; Option A offer search uses only `driver_offer_radius_m`.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  getDispatch() {
    return this.config.getDispatch();
  }

  @Idempotent()
  @Patch('dispatch')
  @ApiOperation({
    summary: 'Update operational dispatch config — no hard-coded business values',
    description: 'Supports `driver_offer_radius_m` (200–5000 m). Changing it updates the driver map circle without a backend deploy.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.IDEMPOTENCY_KEY_REQUIRED)
  patchDispatch(@CurrentUser() user: AuthUser, @Body() dto: UpdateDispatchConfigDto) {
    return this.config.updateDispatch(user, dto);
  }
}
