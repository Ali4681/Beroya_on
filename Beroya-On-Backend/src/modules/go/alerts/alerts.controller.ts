import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GoAlertSeverity, GoOperationalAlertStatus, GoOperationalAlertType, GoRole } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';

class AlertsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GoOperationalAlertType })
  @IsOptional()
  @IsIn(Object.values(GoOperationalAlertType))
  type?: GoOperationalAlertType;

  @ApiPropertyOptional({ enum: GoOperationalAlertStatus })
  @IsOptional()
  @IsIn(Object.values(GoOperationalAlertStatus))
  status?: GoOperationalAlertStatus;

  @ApiPropertyOptional({ enum: GoAlertSeverity })
  @IsOptional()
  @IsIn(Object.values(GoAlertSeverity))
  severity?: GoAlertSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ride_id?: string;
}

class ResolveAlertDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

@ApiBearerAuth()
@ApiTags('ERP')
@Controller('erp/alerts')
@Roles(
  GoRole.CUSTOMER_SERVICE,
  GoRole.CUSTOMER_SERVICE_SUPERVISOR,
  GoRole.OPERATIONS,
  GoRole.ADMIN,
  GoRole.SUPER_ADMIN,
)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'List operational alerts (Phase 4 scheduled + Phase 5 monitoring)' })
  list(@CurrentUser() user: AuthUser, @Query() q: AlertsQueryDto) {
    return this.alerts.list(user, q);
  }

  @Post(':alertId/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim (acknowledge) alert (Ticket §13). Audited.' })
  @ApiGoErrors(E.NOT_FOUND, E.CONFLICT, E.BRANCH_SCOPE_DENIED)
  claim(@CurrentUser() user: AuthUser, @Param('alertId', ParseUUIDPipe) alertId: string) {
    return this.alerts.claim(user, alertId);
  }

  @Post(':alertId/resolve')
  @HttpCode(HttpStatus.OK)
  @Roles(GoRole.CUSTOMER_SERVICE, GoRole.CUSTOMER_SERVICE_SUPERVISOR, GoRole.OPERATIONS, GoRole.ADMIN)
  @ApiOperation({
    summary: 'Resolve alert. Audited.',
    description:
      'Ride-monitoring alerts (LONG_STOP, LOCATION_STALE, …) stay CS / CS supervisor only (Ticket §12.3). ' +
      'Command Center alerts (DRIVER_COVERAGE_LOW, ASSIGNMENT_DELAYED, RIDE_DELAYED, CANCELLATION_RATE_HIGH) ' +
      'may be resolved by operations, CS supervisor, or admin.',
  })
  @ApiGoErrors(E.NOT_FOUND, E.CONFLICT, E.BRANCH_SCOPE_DENIED, E.ROLE_NOT_ALLOWED)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('alertId', ParseUUIDPipe) alertId: string,
    @Body() body: ResolveAlertDto,
  ) {
    return this.alerts.resolve(user, alertId, body);
  }
}
