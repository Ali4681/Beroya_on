import { GoWalletTransactionType, Prisma } from '@/generated/prisma/client';
import {
  ledgerActivityItem,
  mergeActivityItems,
  placeLabel,
  tripEarningItem,
} from './driver-wallet-activity';

describe('driver-wallet-activity', () => {
  it('shortens place labels at the first comma', () => {
    expect(placeLabel('المزة، شارع الثورة')).toBe('المزة');
    expect(placeLabel('  المالكي  ')).toBe('المالكي');
    expect(placeLabel(null)).toBeNull();
  });

  it('builds trip earning and commission card titles with display_code', () => {
    const trip = tripEarningItem({
      id: 'ride-1',
      public_number: 'GO-20261020-04589',
      pickup_address: 'المزة، دمشق',
      original_destination_address: 'المالكي',
      gross_final_fare: new Prisma.Decimal(4500),
      completed_at: new Date('2026-10-18T11:45:00Z'),
    });
    expect(trip).toMatchObject({
      kind: 'TRIP_EARNING',
      amount: 4500,
      signed_amount: 4500,
      public_number: 'GO-20261020-04589',
      display_code: 'TRP-4589',
      pickup_label: 'المزة',
      destination_label: 'المالكي',
      title_ar: 'الرحلة رقم TRP-4589 – من المزة إلى المالكي',
      title_en: 'Trip TRP-4589 – from المزة to المالكي',
    });

    const commission = ledgerActivityItem({
      id: 'tx-1',
      type: GoWalletTransactionType.COMMISSION_DEDUCTION,
      amount: new Prisma.Decimal(450),
      balance_before: new Prisma.Decimal(10000),
      balance_after: new Prisma.Decimal(9550),
      ride_id: 'ride-1',
      created_at: new Date('2026-10-18T11:45:01Z'),
      ride: {
        id: 'ride-1',
        public_number: 'GO-20261020-04589',
        pickup_address: 'المزة',
        original_destination_address: 'المالكي',
      },
    });
    expect(commission).toMatchObject({
      kind: 'COMMISSION_DEDUCTION',
      amount: 450,
      signed_amount: -450,
      display_code: 'TRP-4589',
      title_ar: 'تم خصم العمولة – الرحلة رقم TRP-4589',
      title_en: 'Commission deducted – trip TRP-4589',
    });

    const topUp = ledgerActivityItem({
      id: 'tx-2',
      type: GoWalletTransactionType.TOP_UP,
      amount: new Prisma.Decimal(25000),
      balance_before: new Prisma.Decimal(0),
      balance_after: new Prisma.Decimal(25000),
      ride_id: null,
      created_at: new Date('2026-10-17T10:00:00Z'),
      ride: null,
    });
    expect(topUp).toMatchObject({
      title_ar: 'شحن المحفظة',
      title_en: 'Wallet top-up',
      display_code: null,
    });
    expect(topUp.signed_amount).toBe(25000);
  });

  it('merges newest first', () => {
    const older = tripEarningItem({
      id: 'a',
      public_number: '1',
      pickup_address: 'A',
      original_destination_address: 'B',
      gross_final_fare: new Prisma.Decimal(1),
      completed_at: new Date('2026-01-01T00:00:00Z'),
    })!;
    const newer = ledgerActivityItem({
      id: 'b',
      type: GoWalletTransactionType.TOP_UP,
      amount: new Prisma.Decimal(1),
      balance_before: new Prisma.Decimal(0),
      balance_after: new Prisma.Decimal(1),
      ride_id: null,
      created_at: new Date('2026-01-02T00:00:00Z'),
      ride: null,
    });
    expect(mergeActivityItems([older], [newer]).map((i) => i.id)).toEqual(['b', 'a']);
  });
});
