import { GoIncentiveKind, Prisma } from '@/generated/prisma/client';
import { withinDailyCap } from './incentive-math';
import { IncentivesService } from './incentives.service';

function setup(opts: { existing?: boolean; uniqueViolation?: boolean; cap?: number; paidToday?: number } = {}) {
  const created: unknown[] = [];
  const tx = {
    goDriverIncentiveGrant: {
      create: jest.fn(async ({ data }: { data: unknown }) => {
        if (opts.uniqueViolation) {
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
        }
        created.push(data);
        return { id: 'grant-1', ...(data as object) };
      }),
    },
  };
  const prisma = {
    goDriverProfile: { findUnique: jest.fn(async () => ({ id: 'd1', user_id: 'u1', branch_id: 'b1' })) },
    goIncentiveConfig: {
      upsert: jest.fn(async () => ({
        id: 'default',
        timezone: 'Asia/Damascus',
        min_counted_distance_m: 1000,
        daily_total_cap: opts.cap == null ? null : new Prisma.Decimal(opts.cap),
      })),
    },
    goDriverIncentiveGrant: {
      findUnique: jest.fn(async () => (opts.existing ? { id: 'old' } : null)),
      aggregate: jest.fn(async () => ({ _sum: { amount: new Prisma.Decimal(opts.paidToday ?? 0) } })),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const locks = { withLock: jest.fn(async (_key: string, fn: () => unknown) => fn()) };
  const realtime = { emitToDriver: jest.fn() };
  const audit = { log: jest.fn() };
  const wallets = {
    creditIncentive: jest.fn(async () => ({ id: 'wtx-1' })),
    emitWalletState: jest.fn(),
  };
  const service = new IncentivesService(
    prisma as never,
    locks as never,
    realtime as never,
    audit as never,
    wallets as never,
  );
  return { service, wallets, realtime, audit, created };
}

const input = { driverId: 'd1', kind: GoIncentiveKind.STREAK_DAILY, periodKey: '2026-10-13', amount: 25_000 };

describe('IncentivesService.grantBonus', () => {
  it('credits the wallet once and notifies the driver', async () => {
    const { service, wallets, realtime, created } = setup();
    const out = await service.grantBonus(input);
    expect(out.status).toBe('GRANTED');
    expect(wallets.creditIncentive).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
    expect(realtime.emitToDriver).toHaveBeenCalledWith('u1', 'incentive.awarded', expect.objectContaining({ amount: 25_000 }));
  });

  it('does not pay twice for the same period', async () => {
    const { service, wallets, realtime } = setup({ existing: true });
    expect((await service.grantBonus(input)).status).toBe('DUPLICATE');
    expect(wallets.creditIncentive).not.toHaveBeenCalled();
    expect(realtime.emitToDriver).not.toHaveBeenCalled();
  });

  it('treats a unique-key race as a duplicate', async () => {
    const { service, realtime } = setup({ uniqueViolation: true });
    expect((await service.grantBonus(input)).status).toBe('DUPLICATE');
    expect(realtime.emitToDriver).not.toHaveBeenCalled();
  });

  it('skips and audits when the daily total cap would be exceeded', async () => {
    const { service, wallets, audit } = setup({ cap: 100_000, paidToday: 90_000 });
    expect((await service.grantBonus(input)).status).toBe('CAP_REACHED');
    expect(wallets.creditIncentive).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'incentive.daily_cap_reached' }));
  });

  it('skips zero amounts', async () => {
    const { service } = setup();
    expect((await service.grantBonus({ ...input, amount: 0 })).status).toBe('SKIPPED');
  });
});

describe('withinDailyCap', () => {
  it('allows up to the cap and ignores a null cap', () => {
    expect(withinDailyCap(75_000, 25_000, 100_000)).toBe(true);
    expect(withinDailyCap(75_001, 25_000, 100_000)).toBe(false);
    expect(withinDailyCap(10 ** 9, 1, null)).toBe(true);
  });
});
