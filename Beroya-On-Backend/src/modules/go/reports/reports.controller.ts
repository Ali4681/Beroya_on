import { Controller, Get, Header, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { Response } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { ReportsService } from './reports.service';

const REPORT_VIEWERS = [
  GoRole.OPERATIONS,
  GoRole.FINANCE,
  GoRole.ADMIN,
  GoRole.SUPER_ADMIN,
] as const;

class ReportsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @ApiPropertyOptional({ description: 'Window start (ISO). Default: to − 7 days.' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Window end (ISO). Default: now. Max 90 days.' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}

class DriversQueryDto extends ReportsQueryDto {
  @ApiPropertyOptional({ enum: ['completed', 'accepts', 'rating'] })
  @IsOptional()
  @IsIn(['completed', 'accepts', 'rating'])
  sort?: 'completed' | 'accepts' | 'rating';

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class ExportQueryDto extends ReportsQueryDto {
  @ApiPropertyOptional({ enum: ['overview', 'drivers'], default: 'overview' })
  @IsOptional()
  @IsIn(['overview', 'drivers'])
  kind?: 'overview' | 'drivers';

  @ApiPropertyOptional({ enum: ['ar', 'en'], default: 'ar', description: 'CSV labels language (site locale)' })
  @IsOptional()
  @IsIn(['ar', 'en'])
  lang?: 'ar' | 'en';
}

@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('erp/reports/overview')
  @Roles(...REPORT_VIEWERS)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Ops report overview: cohort KPIs, acceptance, daily/hourly series' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  overview(@CurrentUser() user: AuthUser, @Query() q: ReportsQueryDto) {
    return this.reports.overview(user, q);
  }

  @Get('erp/reports/cancellations')
  @Roles(...REPORT_VIEWERS)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Cancellation breakdown by actor + series' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  cancellations(@CurrentUser() user: AuthUser, @Query() q: ReportsQueryDto) {
    return this.reports.cancellations(user, q);
  }

  @Get('erp/reports/assignment')
  @Roles(...REPORT_VIEWERS)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Assignment time metrics (avg / p50 / p90)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  assignment(@CurrentUser() user: AuthUser, @Query() q: ReportsQueryDto) {
    return this.reports.assignment(user, q);
  }

  @Get('erp/reports/coverage')
  @Roles(...REPORT_VIEWERS)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Coverage alerts and driver online hours in the window' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  coverage(@CurrentUser() user: AuthUser, @Query() q: ReportsQueryDto) {
    return this.reports.coverage(user, q);
  }

  @Get('erp/reports/drivers')
  @Roles(...REPORT_VIEWERS)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Driver performance in the window' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  drivers(@CurrentUser() user: AuthUser, @Query() q: DriversQueryDto) {
    return this.reports.drivers(user, q);
  }

  @Get('erp/reports/export')
  @Roles(...REPORT_VIEWERS)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Localized professional CSV export (overview or drivers)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(
    @CurrentUser() user: AuthUser,
    @Query() q: ExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.reports.exportCsv(user, q);
    res.setHeader('Content-Disposition', file.disposition);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Buffer.from(file.body, 'utf8'));
  }
}
