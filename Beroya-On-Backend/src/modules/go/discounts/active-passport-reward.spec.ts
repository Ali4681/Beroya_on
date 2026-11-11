import { GoDiscountAudience } from '@/generated/prisma/client';
import { DiscountsService } from './discounts.service';

describe('DiscountsService.activePassportReward', () => {
  function serviceWithCodes(codes: unknown[]) {
    const svc = Object.create(DiscountsService.prototype) as DiscountsService;
    (svc as unknown as { usableCodes: (id: string) => Promise<unknown[]> }).usableCodes = jest
      .fn()
      .mockResolvedValue(codes);
    return svc;
  }

  it('picks the highest percentage passport-linked code', async () => {
    const svc = serviceWithCodes([
      {
        id: 'low',
        code: 'MS-LOW',
        percentage: '10',
        expires_at: new Date('2026-11-01T00:00:00.000Z'),
        milestone_grant_id: 'g1',
        audience: GoDiscountAudience.CUSTOMERS,
      },
      {
        id: 'stamp',
        code: 'STAMP15',
        percentage: '15',
        expires_at: new Date('2026-12-01T00:00:00.000Z'),
        milestone_grant_id: null,
        audience: GoDiscountAudience.STAMP,
      },
      {
        id: 'other',
        code: 'ALL50',
        percentage: '50',
        expires_at: new Date('2026-10-20T00:00:00.000Z'),
        milestone_grant_id: null,
        audience: GoDiscountAudience.ALL,
      },
    ]);

    await expect(svc.activePassportReward('cust-1')).resolves.toEqual({
      label: 'خصم 15%',
      percentage: 15,
      discount_code_id: 'stamp',
      code: 'STAMP15',
      expires_at: '2026-12-01T00:00:00.000Z',
    });
  });

  it('returns null when no passport-linked code is usable', async () => {
    const svc = serviceWithCodes([
      {
        id: 'all',
        code: 'ALL10',
        percentage: '10',
        expires_at: new Date('2026-12-01T00:00:00.000Z'),
        milestone_grant_id: null,
        audience: GoDiscountAudience.ALL,
      },
    ]);
    await expect(svc.activePassportReward('cust-1')).resolves.toBeNull();
  });
});
