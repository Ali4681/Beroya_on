import { Injectable } from '@nestjs/common';
import { GoIncentiveKind, Prisma } from '@/generated/prisma/client';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditAction } from '../audit/audit.service';
import { decimalToNumber } from '../pricing/fare.calculator';
import { IncentivesService } from './incentives.service';
import { addDays, dayKey, dayRange } from './time.util';

export interface GrantsQuery {
  from?: string;
  to?: string;
  kind?: GoIncentiveKind;
  driver_id?: string;
  branch_id?: string;
  page?: number;
  limit?: number;
}

type DayRow = { day: string; kind: GoIncentiveKind; amount: Prisma.Decimal; count: bigint };

const MAX_RANGE_DAYS = 366;

/** Columns are `timestamp` holding UTC; compare against UTC text so the session time zone never applies. */
const utcText = (date: Date) => date.toISOString().slice(0, 23);

/** Paid bonuses: list, totals by kind and by local day, and daily-cap hits. */
@Injectable()
export class IncentiveGrantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly incentives: IncentivesService,
    private readonly branchScope: BranchScopeService,
  ) {}

  async report(user: AuthUser, q: GrantsQuery) {
    const config = await this.incentives.getConfig();
    const tz = config.timezone;
    const to = q.to ?? dayKey(new Date(), tz);
    const from = q.from ?? addDays(to, -29);
    if (from > to) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'from must be on or before to');
    if (Date.parse(to) - Date.parse(from) > MAX_RANGE_DAYS * 86_400_000) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, `Range is limited to ${MAX_RANGE_DAYS} days`);
    }
    const range = { gte: dayRange(from, tz).from, lt: dayRange(to, tz).to };
    const branchId = this.branchScope.resolveFilter(user, q.branch_id);

    const where: Prisma.GoDriverIncentiveGrantWhereInput = {
      created_at: range,
      ...(q.kind ? { kind: q.kind } : {}),
      ...(q.driver_id ? { driver_id: q.driver_id } : {}),
      ...(branchId ? { driver: { branch_id: branchId } } : {}),
    };
    const limit = q.limit ?? 50;
    const page = q.page ?? 1;

    const [items, total, byKind, dayRows, capHits] = await Promise.all([
      this.prisma.goDriverIncentiveGrant.findMany({
        where,
        orderBy: { created_at: 'desc' },
        ...pageSkip(page, limit),
        include: {
          driver: { select: { id: true, user: { select: { full_name: true, phone: true } }, branch: { select: { id: true, name_ar: true, code: true } } } },
          ride: { select: { id: true, public_number: true } },
          campaign: { select: { id: true, name: true } },
        },
      }),
      this.prisma.goDriverIncentiveGrant.count({ where }),
      this.prisma.goDriverIncentiveGrant.groupBy({ by: ['kind'], where, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.$queryRaw<DayRow[]>`
        SELECT to_char((g.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
               g.kind, SUM(g.amount) AS amount, COUNT(*) AS count
        FROM go_driver_incentive_grants g
        JOIN go_driver_profiles d ON d.id = g.driver_id
        WHERE g.created_at >= ${utcText(range.gte)}::timestamp AND g.created_at < ${utcText(range.lt)}::timestamp
          ${q.kind ? Prisma.sql`AND g.kind = ${q.kind}::"GoIncentiveKind"` : Prisma.empty}
          ${q.driver_id ? Prisma.sql`AND g.driver_id = ${q.driver_id}` : Prisma.empty}
          ${branchId ? Prisma.sql`AND d.branch_id = ${branchId}` : Prisma.empty}
        GROUP BY 1, 2
        ORDER BY 1`,
      this.prisma.goAuditLog.findMany({
        where: {
          action: AuditAction.INCENTIVE_DAILY_CAP_REACHED,
          created_at: range,
          ...(q.driver_id ? { entity_id: q.driver_id } : {}),
          ...(branchId ? { branch_id: branchId } : {}),
        },
        select: { created_at: true, metadata: true },
      }),
    ]);

    const days = new Map<string, { day: string; amount: number; count: number; by_kind: Partial<Record<GoIncentiveKind, number>>; cap_hits: number }>();
    const dayEntry = (day: string) => {
      let entry = days.get(day);
      if (!entry) {
        entry = { day, amount: 0, count: 0, by_kind: {}, cap_hits: 0 };
        days.set(day, entry);
      }
      return entry;
    };
    for (const row of dayRows) {
      const entry = dayEntry(row.day);
      const amount = decimalToNumber(row.amount);
      entry.amount += amount;
      entry.count += Number(row.count);
      entry.by_kind[row.kind] = (entry.by_kind[row.kind] ?? 0) + amount;
    }
    for (const hit of capHits) dayEntry(dayKey(hit.created_at, tz)).cap_hits += 1;

    const totalAmount = byKind.reduce((sum, row) => sum + decimalToNumber(row._sum.amount ?? 0), 0);
    return {
      from,
      to,
      timezone: tz,
      daily_cap: config.daily_total_cap == null ? null : decimalToNumber(config.daily_total_cap),
      totals: {
        amount: totalAmount,
        count: byKind.reduce((sum, row) => sum + row._count._all, 0),
        cap_hits: capHits.length,
        by_kind: byKind.map((row) => ({ kind: row.kind, amount: decimalToNumber(row._sum.amount ?? 0), count: row._count._all })),
      },
      by_day: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
      items,
      total,
      page,
      limit,
    };
  }
}
