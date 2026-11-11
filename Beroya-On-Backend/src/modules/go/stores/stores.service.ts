import { Injectable, Logger } from '@nestjs/common';
import {
  GoLedgerDirection,
  GoRole,
  GoStoreLedgerType,
  GoStoreStatus,
  GoWalletTransactionType,
  Prisma,
} from '@/generated/prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import type { AuthUser } from '../../../common/auth/auth-user';
import { BranchScopeService } from '../../../common/auth/branch-scope.service';
import { pageSkip } from '../../../common/dto/pagination.dto';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { RealtimeService } from '../../../infra/realtime/realtime.service';
import { LockService } from '../../../infra/redis/lock.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import { WalletService } from '../wallets/wallet.service';
import {
  CreateStoreDto,
  CreateStoreOperatorDto,
  ListStoresQueryDto,
  StoreAdjustmentDto,
  StoreCreditDto,
  StoreLedgerQueryDto,
  StoreStatusDto,
  UpdateStoreDto,
  UpdateStoreOperatorDto,
} from './dto/stores.dto';
import { applyStoreMovement, isUniqueViolation, lockStore, money, STORE_TZ, todayRange } from './store-ledger';
import { newReference, newStoreCode, parseAmount, parsePhone } from './store-money';

const STORE_INCLUDE = {
  branch: { select: { id: true, code: true, name_ar: true, name_en: true } },
} satisfies Prisma.GoStoreInclude;

type StoreWithBranch = Prisma.GoStoreGetPayload<{ include: typeof STORE_INCLUDE }>;

const OPERATOR_SELECT = {
  id: true,
  full_name: true,
  email: true,
  phone: true,
  is_active: true,
  last_login_at: true,
  created_at: true,
} satisfies Prisma.UserSelect;

const LEDGER_INCLUDE = {
  driver: { select: { id: true, user: { select: { full_name: true, phone: true } } } },
  performed_by: { select: { id: true, full_name: true, role: true } },
  reversal: { select: { id: true, reference: true, created_at: true } },
  reversed_entry: { select: { id: true, reference: true } },
} satisfies Prisma.GoStoreLedgerEntryInclude;

type LedgerWithRefs = Prisma.GoStoreLedgerEntryGetPayload<{ include: typeof LEDGER_INCLUDE }>;

export function storeView(s: StoreWithBranch) {
  const balance = new Prisma.Decimal(s.balance);
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    owner_name: s.owner_name,
    mobile_number: s.mobile_number,
    address: s.address,
    latitude: s.latitude == null ? null : Number(s.latitude),
    longitude: s.longitude == null ? null : Number(s.longitude),
    branch: s.branch,
    status: s.status,
    status_reason: s.status_reason,
    status_changed_at: s.status_changed_at,
    balance: money(balance),
    currency: s.currency,
    low_balance_threshold: money(s.low_balance_threshold),
    max_recharge_amount: money(s.max_recharge_amount),
    is_low_balance: balance.lte(s.low_balance_threshold),
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

export function ledgerView(e: LedgerWithRefs) {
  return {
    id: e.id,
    reference: e.reference,
    type: e.type,
    direction: e.direction,
    amount: money(e.amount),
    currency: e.currency,
    balance_before: money(e.balance_before),
    balance_after: money(e.balance_after),
    driver: e.driver
      ? { id: e.driver.id, full_name: e.driver.user.full_name, phone: e.driver.user.phone }
      : null,
    wallet_transaction_id: e.wallet_transaction_id,
    reversed_entry: e.reversed_entry,
    reversal: e.reversal,
    status: e.type === GoStoreLedgerType.DRIVER_RECHARGE_DEBIT ? (e.reversal ? 'REVERSED' : 'COMPLETED') : null,
    external_reference: e.external_reference,
    note: e.note,
    performed_by: e.performed_by,
    created_at: e.created_at,
  };
}

const hashOf = (payload: unknown) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

@Injectable()
export class StoresService {
  private readonly logger = new Logger(StoresService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly audit: AuditService,
    private readonly locks: LockService,
    private readonly wallets: WalletService,
    private readonly sessions: SessionService,
    private readonly realtime: RealtimeService,
  ) {}

  // ---------- Reading ----------

  private async loadStore(actor: AuthUser, storeId: string) {
    const store = await this.prisma.goStore.findUnique({ where: { id: storeId }, include: STORE_INCLUDE });
    if (!store) throw new GoException(GoErrorCode.NOT_FOUND, 'Store not found');
    this.branchScope.assertAccess(actor, store.branch_id);
    return store;
  }

  async overview(actor: AuthUser, requestedBranch?: string) {
    const branchId = this.branchScope.resolveFilter(actor, requestedBranch);
    const storeWhere: Prisma.GoStoreWhereInput = branchId ? { branch_id: branchId } : {};
    const ledgerWhere = (type: GoStoreLedgerType, from?: Date): Prisma.GoStoreLedgerEntryWhereInput => ({
      type,
      ...(from ? { created_at: { gte: from } } : {}),
      ...(branchId ? { store: { branch_id: branchId } } : {}),
    });
    const today = todayRange();
    const [byStatus, balance, low, zero, rechargesToday, rechargesAll, reversalsToday, creditsAll] = await Promise.all([
      this.prisma.goStore.groupBy({ by: ['status'], where: storeWhere, _count: { _all: true } }),
      this.prisma.goStore.aggregate({ where: storeWhere, _sum: { balance: true } }),
      this.prisma.goStore.count({
        where: { ...storeWhere, balance: { lte: this.prisma.goStore.fields.low_balance_threshold, gt: 0 } },
      }),
      this.prisma.goStore.count({ where: { ...storeWhere, balance: 0 } }),
      this.prisma.goStoreLedgerEntry.aggregate({
        where: ledgerWhere(GoStoreLedgerType.DRIVER_RECHARGE_DEBIT, today.from),
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.goStoreLedgerEntry.aggregate({
        where: ledgerWhere(GoStoreLedgerType.DRIVER_RECHARGE_DEBIT),
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.goStoreLedgerEntry.aggregate({
        where: ledgerWhere(GoStoreLedgerType.REVERSAL_CREDIT, today.from),
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.goStoreLedgerEntry.aggregate({
        where: ledgerWhere(GoStoreLedgerType.ADMIN_CREDIT),
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    const count = (s: GoStoreStatus) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
    return {
      currency: 'SYP',
      branch_id: branchId ?? null,
      timezone: STORE_TZ,
      stores: {
        total: count(GoStoreStatus.ACTIVE) + count(GoStoreStatus.SUSPENDED),
        active: count(GoStoreStatus.ACTIVE),
        suspended: count(GoStoreStatus.SUSPENDED),
        low_balance: low,
        zero_balance: zero,
      },
      total_store_balance: money(balance._sum.balance ?? 0),
      recharges_today: { count: rechargesToday._count._all, amount: money(rechargesToday._sum.amount ?? 0) },
      reversals_today: { count: reversalsToday._count._all, amount: money(reversalsToday._sum.amount ?? 0) },
      recharges_all_time: { count: rechargesAll._count._all, amount: money(rechargesAll._sum.amount ?? 0) },
      balance_allocated_all_time: { count: creditsAll._count._all, amount: money(creditsAll._sum.amount ?? 0) },
    };
  }

  async list(actor: AuthUser, q: ListStoresQueryDto) {
    const branchId = this.branchScope.resolveFilter(actor, q.branch_id);
    const and: Prisma.GoStoreWhereInput[] = [];
    if (branchId) and.push({ branch_id: branchId });
    if (q.status) and.push({ status: q.status });
    if (q.balance === 'ZERO') and.push({ balance: 0 });
    if (q.balance === 'LOW') and.push({ balance: { gt: 0, lte: this.prisma.goStore.fields.low_balance_threshold } });
    if (q.balance === 'OK') and.push({ balance: { gt: this.prisma.goStore.fields.low_balance_threshold } });
    if (q.q) {
      const text = q.q.trim();
      const phone = parsePhoneOrNull(text);
      and.push({
        OR: [
          { name: { contains: text, mode: 'insensitive' } },
          { owner_name: { contains: text, mode: 'insensitive' } },
          { code: { contains: text.toUpperCase() } },
          { mobile_number: { contains: phone ?? text.replace(/\s/g, '') } },
        ],
      });
    }
    const where: Prisma.GoStoreWhereInput = and.length ? { AND: and } : {};
    const sort = q.sort ?? 'created_at';
    const order = q.order ?? (sort === 'name' || sort === 'code' ? 'asc' : 'desc');
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const [rows, total] = await Promise.all([
      this.prisma.goStore.findMany({
        where,
        include: { ...STORE_INCLUDE, _count: { select: { operators: true } } },
        orderBy: [{ [sort]: order }, { id: 'asc' }],
        ...pageSkip(page, limit),
      }),
      this.prisma.goStore.count({ where }),
    ]);
    const ids = rows.map((r) => r.id);
    const [last, today] = ids.length
      ? await Promise.all([
          this.prisma.goStoreLedgerEntry.groupBy({
            by: ['store_id'],
            where: { store_id: { in: ids }, type: GoStoreLedgerType.DRIVER_RECHARGE_DEBIT },
            _max: { created_at: true },
          }),
          this.prisma.goStoreLedgerEntry.groupBy({
            by: ['store_id'],
            where: {
              store_id: { in: ids },
              type: GoStoreLedgerType.DRIVER_RECHARGE_DEBIT,
              created_at: { gte: todayRange().from },
            },
            _sum: { amount: true },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    return {
      data: rows.map((r) => {
        const t = today.find((x) => x.store_id === r.id);
        return {
          ...storeView(r),
          operators_count: r._count.operators,
          last_recharge_at: last.find((x) => x.store_id === r.id)?._max.created_at ?? null,
          recharges_today: { count: t?._count._all ?? 0, amount: money(t?._sum.amount ?? 0) },
        };
      }),
      total,
      page,
      limit,
    };
  }

  async get(actor: AuthUser, storeId: string) {
    const store = await this.loadStore(actor, storeId);
    const sums = await this.prisma.goStoreLedgerEntry.groupBy({
      by: ['type', 'direction'],
      where: { store_id: storeId },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const sum = (type: GoStoreLedgerType, direction?: GoLedgerDirection) =>
      sums
        .filter((s) => s.type === type && (!direction || s.direction === direction))
        .reduce(
          (acc, s) => ({ amount: acc.amount.plus(s._sum.amount ?? 0), count: acc.count + s._count._all }),
          { amount: new Prisma.Decimal(0), count: 0 },
        );
    const view = (v: { amount: Prisma.Decimal; count: number }) => ({ amount: money(v.amount), count: v.count });
    const [operators, lastRecharge, today] = await Promise.all([
      this.prisma.user.findMany({
        where: { store_id: storeId, role: GoRole.STORE_OPERATOR },
        select: OPERATOR_SELECT,
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.goStoreLedgerEntry.findFirst({
        where: { store_id: storeId, type: GoStoreLedgerType.DRIVER_RECHARGE_DEBIT },
        orderBy: { created_at: 'desc' },
        select: { created_at: true },
      }),
      this.prisma.goStoreLedgerEntry.aggregate({
        where: {
          store_id: storeId,
          type: GoStoreLedgerType.DRIVER_RECHARGE_DEBIT,
          created_at: { gte: todayRange().from },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);
    return {
      ...storeView(store),
      operators,
      financial: {
        balance_allocated: view(sum(GoStoreLedgerType.ADMIN_CREDIT)),
        driver_recharges: view(sum(GoStoreLedgerType.DRIVER_RECHARGE_DEBIT)),
        reversals: view(sum(GoStoreLedgerType.REVERSAL_CREDIT)),
        adjustments_credit: view(sum(GoStoreLedgerType.ADMIN_ADJUSTMENT, GoLedgerDirection.CREDIT)),
        adjustments_debit: view(sum(GoStoreLedgerType.ADMIN_ADJUSTMENT, GoLedgerDirection.DEBIT)),
        recharges_today: { count: today._count._all, amount: money(today._sum.amount ?? 0) },
        last_recharge_at: lastRecharge?.created_at ?? null,
        fees: '0.00',
        commission: '0.00',
      },
    };
  }

  async ledger(actor: AuthUser, storeId: string, q: StoreLedgerQueryDto) {
    await this.loadStore(actor, storeId);
    const where: Prisma.GoStoreLedgerEntryWhereInput = {
      store_id: storeId,
      ...(q.type ? { type: q.type } : {}),
      ...(q.from || q.to
        ? { created_at: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
        : {}),
    };
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const [rows, total] = await Promise.all([
      this.prisma.goStoreLedgerEntry.findMany({
        where,
        include: LEDGER_INCLUDE,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...pageSkip(page, limit),
      }),
      this.prisma.goStoreLedgerEntry.count({ where }),
    ]);
    return { data: rows.map(ledgerView), total, page, limit };
  }

  async statistics(actor: AuthUser, storeId: string, days = 30) {
    await this.loadStore(actor, storeId);
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.$queryRaw<{ day: string; type: string; n: number; amount: string }[]>`
      SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC' AT TIME ZONE ${STORE_TZ}), 'YYYY-MM-DD') AS day,
             type::text AS type, COUNT(*)::int AS n, COALESCE(SUM(amount), 0)::text AS amount
      FROM go_store_ledger_entries
      WHERE store_id = ${storeId} AND created_at >= ${since}
      GROUP BY 1, 2
      ORDER BY 1`;
    const daysMap = new Map<string, { day: string; recharges: number; recharge_amount: string; credits: string; reversals: string }>();
    for (const r of rows) {
      const d =
        daysMap.get(r.day) ?? { day: r.day, recharges: 0, recharge_amount: '0.00', credits: '0.00', reversals: '0.00' };
      if (r.type === GoStoreLedgerType.DRIVER_RECHARGE_DEBIT) {
        d.recharges = r.n;
        d.recharge_amount = money(r.amount)!;
      } else if (r.type === GoStoreLedgerType.ADMIN_CREDIT) {
        d.credits = money(r.amount)!;
      } else if (r.type === GoStoreLedgerType.REVERSAL_CREDIT) {
        d.reversals = money(r.amount)!;
      }
      daysMap.set(r.day, d);
    }
    const series = [...daysMap.values()];
    const totalAmount = series.reduce((s, d) => s.plus(d.recharge_amount), new Prisma.Decimal(0));
    const totalCount = series.reduce((s, d) => s + d.recharges, 0);
    const distinctDrivers = await this.prisma.goStoreLedgerEntry.findMany({
      where: { store_id: storeId, type: GoStoreLedgerType.DRIVER_RECHARGE_DEBIT, created_at: { gte: since } },
      distinct: ['driver_id'],
      select: { driver_id: true },
    });
    return {
      days,
      timezone: STORE_TZ,
      currency: 'SYP',
      totals: {
        recharges: totalCount,
        recharge_amount: money(totalAmount),
        average_recharge: totalCount ? money(totalAmount.div(totalCount)) : '0.00',
        distinct_drivers: distinctDrivers.length,
      },
      series,
    };
  }

  async auditHistory(actor: AuthUser, storeId: string, page = 1, limit = 20) {
    await this.loadStore(actor, storeId);
    const where = { entity_type: 'GoStore', entity_id: storeId };
    const [rows, total] = await Promise.all([
      this.prisma.goAuditLog.findMany({ where, orderBy: { created_at: 'desc' }, ...pageSkip(page, limit) }),
      this.prisma.goAuditLog.count({ where }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter((x): x is string => !!x))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, full_name: true } })
      : [];
    return {
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actor: r.actor_user_id
          ? { id: r.actor_user_id, role: r.actor_role, full_name: actors.find((a) => a.id === r.actor_user_id)?.full_name ?? null }
          : null,
        metadata: r.metadata,
        created_at: r.created_at,
      })),
      total,
      page,
      limit,
    };
  }

  // ---------- Store management ----------

  async create(actor: AuthUser, dto: CreateStoreDto) {
    this.branchScope.assertAccess(actor, dto.branch_id);
    const branch = await this.prisma.goBranch.findUnique({ where: { id: dto.branch_id }, select: { id: true } });
    if (!branch) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'branch_id does not exist');
    const mobile = parsePhone(dto.mobile_number);
    const threshold = dto.low_balance_threshold != null ? new Prisma.Decimal(dto.low_balance_threshold) : undefined;
    const maxRecharge = dto.max_recharge_amount ? parseAmount(dto.max_recharge_amount, 'max_recharge_amount') : null;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const store = await this.prisma.$transaction(async (tx) => {
          const created = await tx.goStore.create({
            data: {
              code: newStoreCode(),
              name: dto.name,
              owner_name: dto.owner_name,
              mobile_number: mobile,
              address: dto.address ?? null,
              latitude: dto.latitude ?? null,
              longitude: dto.longitude ?? null,
              branch_id: dto.branch_id,
              low_balance_threshold: threshold,
              max_recharge_amount: maxRecharge,
              created_by_id: actor.id,
            },
            include: STORE_INCLUDE,
          });
          await this.audit.log(
            {
              actor,
              action: AuditAction.STORE_CREATED,
              entity_type: 'GoStore',
              entity_id: created.id,
              branch_id: created.branch_id,
              metadata: { code: created.code, name: created.name, opening_balance: '0.00' },
            },
            tx,
          );
          return created;
        });
        return storeView(store);
      } catch (err) {
        if (isUniqueViolation(err, 'code') && attempt < 4) continue;
        throw err;
      }
    }
    throw new GoException(GoErrorCode.CONFLICT, 'Could not allocate a store code, retry');
  }

  async update(actor: AuthUser, storeId: string, dto: UpdateStoreDto) {
    const store = await this.loadStore(actor, storeId);
    if (dto.branch_id && dto.branch_id !== store.branch_id) {
      this.branchScope.assertAccess(actor, dto.branch_id);
      const branch = await this.prisma.goBranch.findUnique({ where: { id: dto.branch_id }, select: { id: true } });
      if (!branch) throw new GoException(GoErrorCode.VALIDATION_ERROR, 'branch_id does not exist');
    }
    const data: Prisma.GoStoreUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.owner_name !== undefined) data.owner_name = dto.owner_name;
    if (dto.mobile_number !== undefined) data.mobile_number = parsePhone(dto.mobile_number);
    if (dto.branch_id !== undefined) data.branch_id = dto.branch_id;
    if (dto.address !== undefined) data.address = dto.address || null;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    if (dto.low_balance_threshold !== undefined) data.low_balance_threshold = new Prisma.Decimal(dto.low_balance_threshold);
    if (dto.max_recharge_amount !== undefined) {
      data.max_recharge_amount = dto.max_recharge_amount === '' ? null : parseAmount(dto.max_recharge_amount, 'max_recharge_amount');
    }

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const before = store as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(data)) {
      const prev = before[key];
      const norm = (v: unknown) => (v == null ? null : v instanceof Prisma.Decimal ? v.toFixed(2) : String(v));
      if (norm(prev) !== norm(value)) changes[key] = { from: norm(prev), to: norm(value) };
    }
    if (Object.keys(changes).length === 0) return storeView(store);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.goStore.update({ where: { id: storeId }, data, include: STORE_INCLUDE });
      await this.audit.log(
        {
          actor,
          action: AuditAction.STORE_UPDATED,
          entity_type: 'GoStore',
          entity_id: storeId,
          branch_id: row.branch_id,
          metadata: { changes } as Prisma.InputJsonValue,
        },
        tx,
      );
      return row;
    });
    return storeView(updated);
  }

  async setStatus(actor: AuthUser, storeId: string, dto: StoreStatusDto) {
    const store = await this.loadStore(actor, storeId);
    if (store.status === dto.status) return storeView(store);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.goStore.update({
        where: { id: storeId },
        data: { status: dto.status, status_reason: dto.reason ?? null, status_changed_at: new Date() },
        include: STORE_INCLUDE,
      });
      await this.audit.log(
        {
          actor,
          action: AuditAction.STORE_STATUS_CHANGED,
          entity_type: 'GoStore',
          entity_id: storeId,
          branch_id: row.branch_id,
          metadata: { from: store.status, to: dto.status, reason: dto.reason ?? null },
        },
        tx,
      );
      return row;
    });
    return storeView(updated);
  }

  // ---------- Balance ----------

  /** Same key + same payload returns the first result; same key + other payload is rejected. */
  private async replayOrReject(storeId: string, key: string | undefined, hash: string) {
    if (!key) return null;
    const prior = await this.prisma.goStoreLedgerEntry.findUnique({
      where: { store_id_idempotency_key: { store_id: storeId, idempotency_key: key } },
      include: LEDGER_INCLUDE,
    });
    if (!prior) return null;
    if (prior.request_hash !== hash) {
      throw new GoException(GoErrorCode.IDEMPOTENCY_KEY_REUSED, 'Idempotency-Key was used with a different request');
    }
    return prior;
  }

  private assertCurrency(currency: string, storeCurrency: string) {
    if (currency.trim().toUpperCase() !== storeCurrency) {
      throw new GoException(GoErrorCode.CURRENCY_MISMATCH, 'Currency does not match the store currency', {
        expected: storeCurrency,
      });
    }
  }

  async credit(actor: AuthUser, storeId: string, dto: StoreCreditDto, key?: string) {
    const store = await this.loadStore(actor, storeId);
    this.assertCurrency(dto.currency, store.currency);
    const amount = parseAmount(dto.amount);
    const hash = hashOf({ op: 'credit', a: amount.toFixed(2), c: store.currency, r: dto.external_reference ?? null, n: dto.note ?? null });
    const replay = await this.replayOrReject(storeId, key, hash);
    if (replay) return { entry: ledgerView(replay), balance: money(replay.balance_after), replayed: true };

    try {
      const entry = await this.prisma.$transaction(async (tx) => {
        const locked = await lockStore(tx, storeId);
        const row = await applyStoreMovement(tx, locked, {
          type: GoStoreLedgerType.ADMIN_CREDIT,
          direction: GoLedgerDirection.CREDIT,
          amount,
          reference: newReference('SC'),
          performedById: actor.id,
          idempotencyKey: key,
          requestHash: hash,
          externalReference: dto.external_reference,
          note: dto.note,
        });
        await this.audit.log(
          {
            actor,
            action: AuditAction.STORE_BALANCE_CREDITED,
            entity_type: 'GoStore',
            entity_id: storeId,
            branch_id: locked.branch_id,
            metadata: {
              reference: row.reference,
              amount: amount.toFixed(2),
              currency: locked.currency,
              balance_before: money(row.balance_before),
              balance_after: money(row.balance_after),
              external_reference: dto.external_reference ?? null,
            },
          },
          tx,
        );
        return tx.goStoreLedgerEntry.findUniqueOrThrow({ where: { id: row.id }, include: LEDGER_INCLUDE });
      });
      return { entry: ledgerView(entry), balance: money(entry.balance_after), replayed: false };
    } catch (err) {
      if (key && isUniqueViolation(err, 'idempotency_key')) {
        const again = await this.replayOrReject(storeId, key, hash);
        if (again) return { entry: ledgerView(again), balance: money(again.balance_after), replayed: true };
      }
      throw err;
    }
  }

  async adjust(actor: AuthUser, storeId: string, dto: StoreAdjustmentDto, key?: string) {
    const store = await this.loadStore(actor, storeId);
    this.assertCurrency(dto.currency, store.currency);
    const amount = parseAmount(dto.amount);
    const hash = hashOf({ op: 'adjust', d: dto.direction, a: amount.toFixed(2), c: store.currency, r: dto.reason });
    const replay = await this.replayOrReject(storeId, key, hash);
    if (replay) return { entry: ledgerView(replay), balance: money(replay.balance_after), replayed: true };

    try {
      const entry = await this.prisma.$transaction(async (tx) => {
        const locked = await lockStore(tx, storeId);
        const row = await applyStoreMovement(tx, locked, {
          type: GoStoreLedgerType.ADMIN_ADJUSTMENT,
          direction: dto.direction,
          amount,
          reference: newReference('SA'),
          performedById: actor.id,
          idempotencyKey: key,
          requestHash: hash,
          note: dto.reason,
        });
        await this.audit.log(
          {
            actor,
            action: AuditAction.STORE_BALANCE_ADJUSTED,
            entity_type: 'GoStore',
            entity_id: storeId,
            branch_id: locked.branch_id,
            metadata: {
              reference: row.reference,
              direction: dto.direction,
              amount: amount.toFixed(2),
              reason: dto.reason,
              balance_before: money(row.balance_before),
              balance_after: money(row.balance_after),
            },
          },
          tx,
        );
        return tx.goStoreLedgerEntry.findUniqueOrThrow({ where: { id: row.id }, include: LEDGER_INCLUDE });
      });
      return { entry: ledgerView(entry), balance: money(entry.balance_after), replayed: false };
    } catch (err) {
      if (key && isUniqueViolation(err, 'idempotency_key')) {
        const again = await this.replayOrReject(storeId, key, hash);
        if (again) return { entry: ledgerView(again), balance: money(again.balance_after), replayed: true };
      }
      throw err;
    }
  }

  /**
   * Undo a POS recharge: the driver gives back exactly what the recharge gave (balance part + settled due)
   * and the store gets the full amount back — all in one transaction. Refused if the driver already spent it.
   */
  async reverseRecharge(actor: AuthUser, entryId: string, reason: string) {
    const original = await this.prisma.goStoreLedgerEntry.findUnique({
      where: { id: entryId },
      include: { store: true, reversal: { select: { id: true } }, wallet_transaction: true, driver: { select: { user_id: true } } },
    });
    if (!original) throw new GoException(GoErrorCode.NOT_FOUND, 'Ledger entry not found');
    this.branchScope.assertAccess(actor, original.store.branch_id);
    if (original.type !== GoStoreLedgerType.DRIVER_RECHARGE_DEBIT || !original.wallet_transaction || !original.driver_id) {
      throw new GoException(GoErrorCode.CONFLICT, 'Only driver recharges can be reversed');
    }
    if (original.reversal) throw new GoException(GoErrorCode.CONFLICT, 'Recharge already reversed');
    const driverId = original.driver_id;
    const walletTx = original.wallet_transaction;

    const result = await this.locks.withLock(
      `wallet:${driverId}`,
      () =>
        this.prisma.$transaction(async (tx) => {
          const store = await lockStore(tx, original.store_id);
          const already = await tx.goStoreLedgerEntry.findUnique({ where: { reversed_entry_id: original.id } });
          if (already) throw new GoException(GoErrorCode.CONFLICT, 'Recharge already reversed');
          const reference = newReference('RV');
          const wallet = await this.wallets.debitPosReversal(tx, {
            driverId,
            original: walletTx,
            reason: `pos-reversal; ref=${reference}; of=${original.reference}; ${reason}`,
            createdById: actor.id,
          });
          const entry = await applyStoreMovement(tx, store, {
            type: GoStoreLedgerType.REVERSAL_CREDIT,
            direction: GoLedgerDirection.CREDIT,
            amount: new Prisma.Decimal(original.amount),
            reference,
            performedById: actor.id,
            driverId,
            reversedEntryId: original.id,
            note: reason,
          });
          await this.audit.log(
            {
              actor,
              action: AuditAction.STORE_RECHARGE_REVERSED,
              entity_type: 'GoStore',
              entity_id: store.id,
              branch_id: store.branch_id,
              metadata: {
                reference,
                original_reference: original.reference,
                amount: money(original.amount),
                driver_id: driverId,
                wallet_transaction_id: wallet.row.id,
                driver_balance_debited: wallet.credited.toFixed(2),
                driver_due_restored: wallet.dueSettled.toFixed(2),
                reason,
              },
            },
            tx,
          );
          return { entry, wallet };
        }),
      { waitMs: 5000, ttlMs: 20_000 },
    );

    await this.notifyDriver(driverId, original.driver?.user_id, 'wallet.pos_recharge_reversed', {
      reference: result.entry.reference,
      original_reference: original.reference,
      amount: Number(original.amount),
      currency: original.currency,
    });
    const entry = await this.prisma.goStoreLedgerEntry.findUniqueOrThrow({
      where: { id: result.entry.id },
      include: LEDGER_INCLUDE,
    });
    return { entry: ledgerView(entry), store_balance: money(entry.balance_after) };
  }

  /** Socket/push after commit. Failures are logged; the money movement already succeeded. */
  async notifyDriver(driverId: string, driverUserId: string | undefined, event: string, payload: Record<string, unknown>) {
    if (!driverUserId) return;
    try {
      await this.wallets.emitWalletState(driverId, driverUserId);
      this.realtime.emitToDriver(driverUserId, event, payload);
    } catch (err) {
      this.logger.warn(`Driver notification ${event} failed: ${(err as Error).message}`);
    }
  }

  // ---------- Operators ----------

  async listOperators(actor: AuthUser, storeId: string) {
    await this.loadStore(actor, storeId);
    return this.prisma.user.findMany({
      where: { store_id: storeId, role: GoRole.STORE_OPERATOR },
      select: OPERATOR_SELECT,
      orderBy: { created_at: 'asc' },
    });
  }

  async createOperator(actor: AuthUser, storeId: string, dto: CreateStoreOperatorDto) {
    const store = await this.loadStore(actor, storeId);
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone ? parsePhone(dto.phone) : null;
    const taken = await this.prisma.user.findFirst({
      where: { OR: [{ email }, ...(phone ? [{ phone, role: GoRole.STORE_OPERATOR }] : [])] },
      select: { id: true },
    });
    if (taken) throw new GoException(GoErrorCode.CONFLICT, 'Email or phone already in use');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            role: GoRole.STORE_OPERATOR,
            email,
            phone,
            full_name: dto.full_name,
            password_hash: passwordHash,
            branch_id: store.branch_id,
            store_id: store.id,
          },
          select: OPERATOR_SELECT,
        });
        await this.audit.log(
          {
            actor,
            action: AuditAction.STORE_OPERATOR_CREATED,
            entity_type: 'GoStore',
            entity_id: store.id,
            branch_id: store.branch_id,
            metadata: { operator_id: user.id, email, full_name: dto.full_name },
          },
          tx,
        );
        return user;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new GoException(GoErrorCode.CONFLICT, 'Email or phone already in use');
      throw err;
    }
  }

  async updateOperator(actor: AuthUser, storeId: string, userId: string, dto: UpdateStoreOperatorDto) {
    const store = await this.loadStore(actor, storeId);
    const current = await this.prisma.user.findFirst({
      where: { id: userId, store_id: storeId, role: GoRole.STORE_OPERATOR },
      select: OPERATOR_SELECT,
    });
    if (!current) throw new GoException(GoErrorCode.NOT_FOUND, 'Operator not found for this store');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id: userId },
        data: {
          full_name: dto.full_name,
          is_active: dto.is_active,
          password_hash: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
        },
        select: OPERATOR_SELECT,
      });
      await this.audit.log(
        {
          actor,
          action: AuditAction.STORE_OPERATOR_UPDATED,
          entity_type: 'GoStore',
          entity_id: store.id,
          branch_id: store.branch_id,
          metadata: {
            operator_id: userId,
            full_name: dto.full_name ?? undefined,
            is_active: dto.is_active ?? undefined,
            password_reset: dto.password ? true : undefined,
          },
        },
        tx,
      );
      return row;
    });
    if (dto.password || dto.is_active === false) await this.sessions.revokeAllForUser(userId);
    return updated;
  }

  // ---------- Reconciliation ----------

  async reconciliation(actor: AuthUser, requestedBranch?: string) {
    const branchId = this.branchScope.resolveFilter(actor, requestedBranch);
    const branchSql = branchId ? Prisma.sql`AND s.branch_id = ${branchId}` : Prisma.empty;

    const [debitWithoutWallet, walletWithoutDebit, mismatched, reversalMismatch, negative, storesChecked, netMismatch, chainBreaks] = await Promise.all([
      this.prisma.$queryRaw<{ reference: string }[]>`
        SELECT l.reference FROM go_store_ledger_entries l JOIN go_stores s ON s.id = l.store_id
        LEFT JOIN go_driver_wallet_transactions w ON w.id = l.wallet_transaction_id
        WHERE l.type = 'DRIVER_RECHARGE_DEBIT' AND w.id IS NULL ${branchSql} LIMIT 50`,
      this.prisma.$queryRaw<{ id: string; reason: string | null }[]>`
        SELECT w.id, w.reason FROM go_driver_wallet_transactions w
        JOIN go_driver_profiles d ON d.id = w.driver_id
        LEFT JOIN go_store_ledger_entries l ON l.wallet_transaction_id = w.id
        WHERE w.type = 'POS_RECHARGE' AND l.id IS NULL
        ${branchId ? Prisma.sql`AND d.branch_id = ${branchId}` : Prisma.empty} LIMIT 50`,
      this.prisma.$queryRaw<{ reference: string }[]>`
        SELECT l.reference FROM go_store_ledger_entries l JOIN go_stores s ON s.id = l.store_id
        JOIN go_driver_wallet_transactions w ON w.id = l.wallet_transaction_id
        WHERE (l.amount <> w.amount OR l.driver_id IS DISTINCT FROM w.driver_id OR w.type <> 'POS_RECHARGE'
               OR l.currency <> s.currency) ${branchSql} LIMIT 50`,
      this.prisma.$queryRaw<{ reference: string }[]>`
        SELECT r.reference FROM go_store_ledger_entries r JOIN go_stores s ON s.id = r.store_id
        JOIN go_store_ledger_entries o ON o.id = r.reversed_entry_id
        WHERE r.type = 'REVERSAL_CREDIT' AND (r.amount <> o.amount OR o.type <> 'DRIVER_RECHARGE_DEBIT'
              OR r.store_id <> o.store_id) ${branchSql} LIMIT 50`,
      this.prisma.$queryRaw<{ code: string }[]>`
        SELECT s.code FROM go_stores s WHERE s.balance < 0 ${branchSql} LIMIT 50`,
      this.prisma.goStore.count({ where: branchId ? { branch_id: branchId } : {} }),
      // Order-independent: stored balance must equal credits minus debits.
      this.prisma.$queryRaw<{ code: string; stored_balance: string; ledger_net: string }[]>`
        SELECT s.code, s.balance::text AS stored_balance,
               COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END), 0)::text AS ledger_net
        FROM go_stores s LEFT JOIN go_store_ledger_entries l ON l.store_id = s.id
        WHERE TRUE ${branchSql}
        GROUP BY s.id
        HAVING s.balance <> COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END), 0)
        LIMIT 50`,
      // Each row must start where the previous row of the same store ended.
      this.prisma.$queryRaw<{ reference: string; balance_before: string; expected_before: string }[]>`
        SELECT x.reference, x.balance_before::text AS balance_before, x.expected_before::text AS expected_before
        FROM (
          SELECT l.reference, l.balance_before,
                 COALESCE(LAG(l.balance_after) OVER (PARTITION BY l.store_id ORDER BY l.created_at, l.id), 0) AS expected_before
          FROM go_store_ledger_entries l JOIN go_stores s ON s.id = l.store_id
          WHERE TRUE ${branchSql}
        ) x
        WHERE x.balance_before <> x.expected_before
        LIMIT 50`,
    ]);

    const checks = [
      { key: 'RECHARGE_WITHOUT_WALLET_CREDIT', count: debitWithoutWallet.length, samples: debitWithoutWallet.map((x) => x.reference) },
      { key: 'WALLET_CREDIT_WITHOUT_STORE_DEBIT', count: walletWithoutDebit.length, samples: walletWithoutDebit.map((x) => x.id) },
      { key: 'AMOUNT_OR_DRIVER_MISMATCH', count: mismatched.length, samples: mismatched.map((x) => x.reference) },
      { key: 'REVERSAL_MISMATCH', count: reversalMismatch.length, samples: reversalMismatch.map((x) => x.reference) },
      { key: 'NEGATIVE_STORE_BALANCE', count: negative.length, samples: negative.map((x) => x.code) },
      { key: 'STORE_BALANCE_VS_LEDGER', count: netMismatch.length, samples: netMismatch },
      { key: 'LEDGER_CHAIN_BREAK', count: chainBreaks.length, samples: chainBreaks },
    ].map((c) => ({ ...c, ok: c.count === 0 }));

    return {
      generated_at: new Date().toISOString(),
      branch_id: branchId ?? null,
      stores_checked: storesChecked,
      ok: checks.every((c) => c.ok),
      checks,
      notes: {
        duplicate_references: 'Prevented by a unique index on go_store_ledger_entries.reference',
        duplicate_wallet_links: 'Prevented by a unique index on go_store_ledger_entries.wallet_transaction_id',
      },
    };
  }

  /** POS wallet transactions of one driver (staff view of the wallet ledger already shows them; this adds the store). */
  async driverPosHistory(driverUserId: string, page = 1, limit = 20) {
    const driver = await this.prisma.goDriverProfile.findUnique({ where: { user_id: driverUserId }, select: { id: true } });
    if (!driver) throw new GoException(GoErrorCode.ACCOUNT_NOT_FOUND, 'Driver profile not found');
    const where: Prisma.GoStoreLedgerEntryWhereInput = {
      driver_id: driver.id,
      type: GoStoreLedgerType.DRIVER_RECHARGE_DEBIT,
    };
    const [rows, total] = await Promise.all([
      this.prisma.goStoreLedgerEntry.findMany({
        where,
        include: { store: { select: { name: true, code: true } }, reversal: { select: { created_at: true } } },
        orderBy: { created_at: 'desc' },
        ...pageSkip(page, limit),
      }),
      this.prisma.goStoreLedgerEntry.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        reference: r.reference,
        type: GoWalletTransactionType.POS_RECHARGE,
        amount: money(r.amount),
        currency: r.currency,
        store_name: r.store.name,
        store_code: r.store.code,
        status: r.reversal ? 'REVERSED' : 'COMPLETED',
        reversed_at: r.reversal?.created_at ?? null,
        created_at: r.created_at,
      })),
      total,
      page,
      limit,
    };
  }
}

function parsePhoneOrNull(text: string) {
  try {
    return parsePhone(text);
  } catch {
    return null;
  }
}
