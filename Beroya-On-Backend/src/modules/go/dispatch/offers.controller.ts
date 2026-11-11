import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { DispatchService } from './dispatch.service';

@ApiBearerAuth()
@ApiTags('Driver')
@Controller('driver/offers')
@Roles(GoRole.DRIVER)
export class OffersController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get()
  @ApiOperation({
    summary: 'Pending ride offers (REST fallback — Ticket §7.8)',
    description:
      'Enriched with `customer` { full_name, avatar_url, rating_avg, rating_count } (no phone until accept), ' +
      '`service_code` + `service` { code, name_ar, name_en }, ' +
      '`ride_category` { id, code, name_ar, name_en }, `type`, `scheduled_at`, ' +
      '`payment_method` + `payment_method_label_ar`, `estimated_route_polyline`, ' +
      '`bonus` + `has_bonus`, and ride.destination (null for RENTAL). ' +
      'Same top-level fields are on socket `ride.offer` / `ride_offer.created`.',
  })
  list(@CurrentUser() user: AuthUser) {
    return this.dispatch.listOffersForDriver(user.id);
  }

  @Idempotent()
  @Post(':offerId/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atomic accept — first valid wins (Ticket §7.8)' })
  @ApiGoErrors(
    E.NOT_FOUND,
    E.RIDE_ALREADY_TAKEN,
    E.DRIVER_NOT_ELIGIBLE,
    E.DRIVER_ALREADY_HAS_NEXT_RIDE,
    E.IDEMPOTENCY_KEY_REQUIRED,
  )
  accept(@CurrentUser() user: AuthUser, @Param('offerId', ParseUUIDPipe) offerId: string) {
    return this.dispatch.acceptOffer(user, offerId);
  }

  @Post(':offerId/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline offer (not a ride cancel)' })
  @ApiGoErrors(E.NOT_FOUND, E.CONFLICT)
  decline(@CurrentUser() user: AuthUser, @Param('offerId', ParseUUIDPipe) offerId: string) {
    return this.dispatch.declineOffer(user, offerId);
  }
}
