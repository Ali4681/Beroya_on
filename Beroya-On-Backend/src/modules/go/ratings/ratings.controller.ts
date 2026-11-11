import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { Idempotent } from '../../../common/idempotency/idempotent.decorator';
import { SubmitRideRatingDto } from './dto/ratings.dto';
import { RatingsService } from './ratings.service';

@ApiBearerAuth()
@Controller()
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Idempotent()
  @Post('customer/rides/:rideId/rating')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER)
  @ApiTags('Customer')
  @ApiOperation({
    summary: 'Rate driver after completed ride (Ticket §11.1)',
    description:
      'Requires Idempotency-Key. Same key + same body replays the first response; same key + different body → IDEMPOTENCY_KEY_REUSED.',
  })
  @ApiGoErrors(
    E.UNAUTHORIZED,
    E.ROLE_NOT_ALLOWED,
    E.RIDE_NOT_FOUND,
    E.VALIDATION_ERROR,
    E.CONFLICT,
    E.IDEMPOTENCY_KEY_REQUIRED,
    E.IDEMPOTENCY_KEY_REUSED,
  )
  rateDriver(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: SubmitRideRatingDto,
  ) {
    return this.ratings.rateByCustomer(user.id, rideId, dto);
  }

  @Idempotent()
  @Post('driver/rides/:rideId/rating')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.DRIVER)
  @ApiTags('Driver')
  @ApiOperation({
    summary: 'Rate customer after completed ride (Ticket §11.2 / §23.5) — «كيف كان الزبون؟»',
    description:
      'Only when ride status is COMPLETED. Body: `{ stars: 1–5, notes?, reasons? }` (`notes` not `comment`). ' +
      'Requires Idempotency-Key — same key + body replays the first response. ' +
      'Already rated (different key) → CONFLICT. ' +
      'Skip = do not call this endpoint (no separate skip API). ' +
      'After success, GET …/invoice shows `rating.can_rate: false` and `my_rating: { stars }`.',
  })
  @ApiGoErrors(
    E.UNAUTHORIZED,
    E.ROLE_NOT_ALLOWED,
    E.RIDE_NOT_FOUND,
    E.VALIDATION_ERROR,
    E.CONFLICT,
    E.IDEMPOTENCY_KEY_REQUIRED,
    E.IDEMPOTENCY_KEY_REUSED,
  )
  rateCustomer(
    @CurrentUser() user: AuthUser,
    @Param('rideId', ParseUUIDPipe) rideId: string,
    @Body() dto: SubmitRideRatingDto,
  ) {
    return this.ratings.rateByDriver(user.id, rideId, dto);
  }
}
