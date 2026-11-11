import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { DriverScoresService } from './driver-scores.service';
import { DriverScoresQueryDto, RecomputeScoresDto } from './dto/driver-scores.dto';

@ApiBearerAuth()
@ApiTags('Admin')
@Controller('admin/driver-scores')
export class DriverScoresController {
  constructor(private readonly scores: DriverScoresService) {}

  @Get()
  @Roles(...ADMIN_ROLES, GoRole.OPERATIONS)
  @ApiOperation({
    summary: 'Driver scores of one snapshot day',
    description:
      'Composite 0–100 score per driver over score_window_days: rating, acceptance, online hours and earnings ' +
      '(hours / earnings ranked inside the branch), minus the cancellation penalty. Bands: KEEP, WATCH, REPLACEABLE.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED)
  list(@CurrentUser() user: AuthUser, @Query() q: DriverScoresQueryDto) {
    return this.scores.list(user, q);
  }

  @Post('recompute')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Rebuild the snapshot of an ended day with the current weights (audited)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR, E.CONFLICT)
  recompute(@CurrentUser() user: AuthUser, @Body() dto: RecomputeScoresDto) {
    return this.scores.recompute(user, dto.day);
  }

  @Get(':driverId')
  @Roles(...ADMIN_ROLES, GoRole.OPERATIONS)
  @ApiOperation({ summary: 'Live score breakdown and snapshot history of one driver' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.NOT_FOUND, E.BRANCH_SCOPE_DENIED)
  detail(@CurrentUser() user: AuthUser, @Param('driverId', ParseUUIDPipe) driverId: string) {
    return this.scores.detail(user, driverId);
  }
}
