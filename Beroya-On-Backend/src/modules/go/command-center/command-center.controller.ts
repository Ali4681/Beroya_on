import { Body, Controller, Get, Header, Patch, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { GoRole } from '@/generated/prisma/client';
import { IsIn, IsOptional } from 'class-validator';
import type { Response } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../../common/auth/decorators';
import { ApiGoErrors } from '../../../common/dto/api-errors.decorator';
import { GoErrorCode as E } from '../../../common/errors/go-error-codes';
import { CommandCenterService } from './command-center.service';
import { CommandCenterQueryDto, UpdateCommandCenterConfigDto } from './dto/command-center.dto';

class FinanceExportQueryDto extends CommandCenterQueryDto {
  @ApiPropertyOptional({ enum: ['ar', 'en'], default: 'ar' })
  @IsOptional()
  @IsIn(['ar', 'en'])
  lang?: 'ar' | 'en';
}

const OPS_VIEWERS = [
  GoRole.CUSTOMER_SERVICE,
  GoRole.CUSTOMER_SERVICE_SUPERVISOR,
  GoRole.OPERATIONS,
  GoRole.ADMIN,
  GoRole.SUPER_ADMIN,
] as const;

const FINANCE_VIEWERS = [GoRole.FINANCE, GoRole.ADMIN, GoRole.SUPER_ADMIN] as const;

@ApiBearerAuth()
@Controller()
export class CommandCenterController {
  constructor(private readonly cc: CommandCenterService) {}

  @Get('erp/command-center/summary')
  @Roles(...OPS_VIEWERS)
  @ApiTags('ERP')
  @ApiOperation({
    summary: 'Command Center: live counts, period KPIs vs the previous window, time series and insights',
    description:
      'Period KPIs use rides requested (created_at) in [from, to); replacement rides are excluded. ' +
      'Rates are over finished rides (completed + cancelled + no-show + unserved + interrupted). ' +
      'Average assignment / pickup wait use immediate rides only. Insights carry the evidence they are based on.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  summary(@CurrentUser() user: AuthUser, @Query() q: CommandCenterQueryDto) {
    return this.cc.summary(user, q);
  }

  @Get('erp/command-center/finance')
  @Roles(...FINANCE_VIEWERS)
  @ApiTags('ERP')
  @ApiOperation({
    summary: 'Financial performance: marketplace volume, company revenue/costs, contribution, series',
    description:
      'Gross fares are what customers were charged, not company revenue. Company revenue = net commission ' +
      '(deductions − reversals) + driver cancel penalties. Costs = incentives paid + compensation borne by Beroya. ' +
      'Contribution = revenue − costs. Customer wallets are not branch-scoped and are null for branch staff.',
  })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  finance(@CurrentUser() user: AuthUser, @Query() q: CommandCenterQueryDto) {
    return this.cc.finance(user, q);
  }

  @Get('erp/finance/performance')
  @Roles(...FINANCE_VIEWERS)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Alias of command-center finance for the finance desk screen' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  financePerformance(@CurrentUser() user: AuthUser, @Query() q: CommandCenterQueryDto) {
    return this.cc.finance(user, q);
  }

  @Get('erp/finance/performance/export')
  @Roles(...FINANCE_VIEWERS)
  @ApiTags('ERP')
  @ApiOperation({ summary: 'Localized CSV export of financial performance' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.BRANCH_SCOPE_DENIED, E.VALIDATION_ERROR)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async financeExport(
    @CurrentUser() user: AuthUser,
    @Query() q: FinanceExportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.cc.exportFinanceCsv(user, q);
    res.setHeader('Content-Disposition', file.disposition);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(Buffer.from(file.body, 'utf8'));
  }

  @Get('admin/command-center/config')
  @Roles(...OPS_VIEWERS, GoRole.FINANCE)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Command Center alert thresholds' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED)
  getConfig() {
    return this.cc.getConfig();
  }

  @Patch('admin/command-center/config')
  @Roles(GoRole.ADMIN, GoRole.SUPER_ADMIN)
  @ApiTags('Admin')
  @ApiOperation({ summary: 'Update Command Center alert thresholds (audited)' })
  @ApiGoErrors(E.UNAUTHORIZED, E.ROLE_NOT_ALLOWED, E.VALIDATION_ERROR)
  updateConfig(@CurrentUser() user: AuthUser, @Body() dto: UpdateCommandCenterConfigDto) {
    return this.cc.updateConfig(user, dto);
  }
}
