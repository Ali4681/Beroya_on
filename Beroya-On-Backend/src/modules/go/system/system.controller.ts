import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import {
  GoComplaintStatus,
  GoDevicePlatform,
  GoDocumentType,
  GoDriverAvailability,
  GoDriverGender,
  GoLanguage,
  GoPaymentMethod,
  GoPaymentStatus,
  GoFareStackDecision,
  GoRideRequirementType,
  GoRideStatus,
  GoRideType,
  GoRole,
  GoSavedPlaceKind,
  GoSupportMessageStatus,
} from '@/generated/prisma/client';
import type { Response } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { CurrentUser, Public, Roles } from '../../../common/auth/decorators';
import { ADMIN_ROLES, STAFF_ROLES } from '../../../common/auth/roles';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GO_ERROR_HTTP_STATUS, GoErrorCode, GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { NOTIFICATION_CATEGORIES } from '../notifications/notification-category';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { QueueHealthService } from '../../../infra/queue/queue-health.service';
import { RedisService } from '../../../infra/redis/redis.service';
import { COMPLAINT_REASON_CODES, URGENT_REASON_CODES } from '../complaints/complaint-reasons';
import { EnumsDto, ErrorCodeItemDto, HealthDto, PingDto } from './system.dto';

export const CURRENT_PHASE = 'phase-10';
const startedAt = Date.now();

@ApiTags('System')
@Controller()
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queues: QueueHealthService,
    private readonly branchScope: BranchScopeService,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Liveness/readiness. 200 when DB is up (Redis may be in fallback), 503 when DB is down' })
  @ApiOkResponse({ type: HealthDto })
  @ApiServiceUnavailableResponse({ type: HealthDto })
  async health(@Res({ passthrough: true }) res: Response): Promise<HealthDto> {
    const [db, redis, queue] = await Promise.all([this.prisma.isHealthy(), this.redis.ping(), this.queues.isHealthy()]);
    const status = !db ? 'down' : redis && queue ? 'ok' : 'degraded';
    if (status === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status,
      version: process.env.npm_package_version ?? '0.1.0',
      phase: CURRENT_PHASE,
      uptime_sec: Math.round((Date.now() - startedAt) / 1000),
      checks: { database: db ? 'up' : 'down', redis: redis ? 'up' : 'fallback', queue: queue ? 'up' : 'down' },
      time: new Date().toISOString(),
    };
  }

  @Public()
  @Get('meta/error-codes')
  @ApiTags('Meta')
  @ApiOperation({ summary: 'All central error codes with their HTTP status (Ticket §43)' })
  @ApiOkResponse({ type: [ErrorCodeItemDto] })
  errorCodes(): ErrorCodeItemDto[] {
    return Object.values(GoErrorCode).map((code) => ({ code, http_status: GO_ERROR_HTTP_STATUS[code] }));
  }

  @Public()
  @Get('meta/enums')
  @ApiTags('Meta')
  @ApiOperation({ summary: 'Enum values used by the API. Grows with each phase' })
  @ApiOkResponse({ type: EnumsDto })
  enums(): EnumsDto {
    return {
      enums: {
        GoRole: Object.values(GoRole),
        GoDevicePlatform: Object.values(GoDevicePlatform),
        GoRideRequirementType: Object.values(GoRideRequirementType),
        GoDriverGender: Object.values(GoDriverGender),
        GoDocumentType: Object.values(GoDocumentType),
        GoRideType: Object.values(GoRideType),
        GoRideStatus: Object.values(GoRideStatus),
        GoPaymentMethod: Object.values(GoPaymentMethod),
        GoPaymentStatus: Object.values(GoPaymentStatus),
        GoFareStackDecision: Object.values(GoFareStackDecision),
        GoDriverAvailability: Object.values(GoDriverAvailability),
        GoLanguage: Object.values(GoLanguage),
        NotificationCategory: [...NOTIFICATION_CATEGORIES],
        GoComplaintReasonCode: [...COMPLAINT_REASON_CODES],
        GoComplaintUrgentReasonCode: [...URGENT_REASON_CODES],
        GoComplaintStatus: Object.values(GoComplaintStatus),
        GoSupportMessageStatus: Object.values(GoSupportMessageStatus),
        GoSavedPlaceKind: Object.values(GoSavedPlaceKind),
      },
    };
  }

  @ApiBearerAuth()
  @Roles(GoRole.CUSTOMER)
  @Get('customer/ping')
  @ApiTags('Customer')
  @ApiOperation({ summary: 'Customer token check' })
  @ApiOkResponse({ type: PingDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  customerPing(@CurrentUser() user: AuthUser): PingDto {
    return { scope: 'customer', user_id: user.id, role: user.role };
  }

  @ApiBearerAuth()
  @Roles(GoRole.DRIVER)
  @Get('driver/ping')
  @ApiTags('Driver')
  @ApiOperation({ summary: 'Driver token check' })
  @ApiOkResponse({ type: PingDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  driverPing(@CurrentUser() user: AuthUser): PingDto {
    return { scope: 'driver', user_id: user.id, role: user.role };
  }

  @ApiBearerAuth()
  @Roles(...STAFF_ROLES)
  @Get('erp/ping')
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Staff token check; returns the effective branch scope' })
  @ApiOkResponse({ type: PingDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED)
  erpPing(@CurrentUser() user: AuthUser): PingDto {
    return { scope: 'erp', user_id: user.id, role: user.role, branch_scope: this.branchScope.scopeOf(user) };
  }

  @ApiBearerAuth()
  @Roles(...ADMIN_ROLES)
  @Get('admin/ping')
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Admin token check (ADMIN, SUPER_ADMIN)' })
  @ApiOkResponse({ type: PingDto })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  adminPing(@CurrentUser() user: AuthUser): PingDto {
    return { scope: 'admin', user_id: user.id, role: user.role };
  }
}
