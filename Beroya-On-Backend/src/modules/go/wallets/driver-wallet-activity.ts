import { GoWalletTransactionType, Prisma } from '@/generated/prisma/client';
import { decimalToNumber } from '../pricing/fare.calculator';
import { rideDisplayCode } from '../rides/ride-display-code';

/** Activity kinds: wallet ledger types plus synthetic trip earnings for the Figma feed. */
export type DriverWalletActivityKind = GoWalletTransactionType | 'TRIP_EARNING';

export interface DriverWalletActivityItem {
  id: string;
  kind: DriverWalletActivityKind;
  amount: number;
  signed_amount: number;
  created_at: Date;
  ride_id: string | null;
  public_number: string | null;
  /** Short UI code (`TRP-4589`); null when the row is not ride-linked. */
  display_code: string | null;
  pickup_label: string | null;
  destination_label: string | null;
  title_ar: string;
  title_en: string;
}

/** Short place label for activity cards — first comma segment, max 40 chars. */
export function placeLabel(address: string | null | undefined): string | null {
  if (!address) return null;
  const trimmed = address.trim();
  if (!trimmed) return null;
  const head = trimmed.split(/[,،]/u)[0]?.trim() || trimmed;
  return head.length > 40 ? `${head.slice(0, 39)}…` : head;
}

function codeOrNull(publicNumber: string | null | undefined): string | null {
  if (!publicNumber?.trim()) return null;
  return rideDisplayCode(publicNumber);
}

function tripTitles(code: string | null, pickup: string | null, destination: string | null) {
  const n = code ?? '—';
  if (pickup && destination) {
    return {
      title_ar: `الرحلة رقم ${n} – من ${pickup} إلى ${destination}`,
      title_en: `Trip ${n} – from ${pickup} to ${destination}`,
    };
  }
  if (pickup) {
    return {
      title_ar: `الرحلة رقم ${n} – من ${pickup}`,
      title_en: `Trip ${n} – from ${pickup}`,
    };
  }
  return {
    title_ar: `الرحلة رقم ${n}`,
    title_en: `Trip ${n}`,
  };
}

function ledgerTitles(type: GoWalletTransactionType, code: string | null): { title_ar: string; title_en: string } {
  switch (type) {
    case GoWalletTransactionType.COMMISSION_DEDUCTION:
      return code
        ? {
            title_ar: `تم خصم العمولة – الرحلة رقم ${code}`,
            title_en: `Commission deducted – trip ${code}`,
          }
        : { title_ar: 'تم خصم العمولة', title_en: 'Commission deducted' };
    case GoWalletTransactionType.TOP_UP:
    case GoWalletTransactionType.POS_RECHARGE:
      return { title_ar: 'شحن المحفظة', title_en: 'Wallet top-up' };
    case GoWalletTransactionType.INCENTIVE_BONUS:
      return { title_ar: 'مكافأة حوافز', title_en: 'Incentive bonus' };
    case GoWalletTransactionType.DISCOUNT_SUBSIDY:
      return code
        ? {
            title_ar: `تعويض خصم الشركة – الرحلة رقم ${code}`,
            title_en: `Company discount subsidy – trip ${code}`,
          }
        : { title_ar: 'تعويض خصم الشركة', title_en: 'Company discount subsidy' };
    case GoWalletTransactionType.DRIVER_CANCEL_PENALTY:
      return code
        ? {
            title_ar: `غرامة إلغاء – الرحلة رقم ${code}`,
            title_en: `Cancel penalty – trip ${code}`,
          }
        : { title_ar: 'غرامة إلغاء', title_en: 'Cancel penalty' };
    case GoWalletTransactionType.COMPENSATION_BEARER:
      return code
        ? {
            title_ar: `تعويض على السائق – الرحلة رقم ${code}`,
            title_en: `Driver compensation – trip ${code}`,
          }
        : { title_ar: 'تعويض على السائق', title_en: 'Driver compensation' };
    case GoWalletTransactionType.REVERSAL:
      return { title_ar: 'عكس معاملة', title_en: 'Transaction reversal' };
    case GoWalletTransactionType.ADJUSTMENT:
      return { title_ar: 'تعديل رصيد', title_en: 'Balance adjustment' };
    default:
      return { title_ar: type, title_en: type };
  }
}

type RideRow = {
  id: string;
  public_number: string;
  pickup_address: string | null;
  original_destination_address: string | null;
  gross_final_fare: Prisma.Decimal | null;
  completed_at: Date | null;
};

type TxRow = {
  id: string;
  type: GoWalletTransactionType;
  amount: Prisma.Decimal;
  balance_before: Prisma.Decimal;
  balance_after: Prisma.Decimal;
  ride_id: string | null;
  created_at: Date;
  ride: {
    id: string;
    public_number: string;
    pickup_address: string | null;
    original_destination_address: string | null;
  } | null;
};

export function tripEarningItem(ride: RideRow): DriverWalletActivityItem | null {
  if (!ride.completed_at || ride.gross_final_fare == null) return null;
  const amount = decimalToNumber(ride.gross_final_fare);
  const pickup = placeLabel(ride.pickup_address);
  const destination = placeLabel(ride.original_destination_address);
  const display_code = codeOrNull(ride.public_number);
  return {
    id: ride.id,
    kind: 'TRIP_EARNING',
    amount,
    signed_amount: amount,
    created_at: ride.completed_at,
    ride_id: ride.id,
    public_number: ride.public_number,
    display_code,
    pickup_label: pickup,
    destination_label: destination,
    ...tripTitles(display_code, pickup, destination),
  };
}

export function ledgerActivityItem(tx: TxRow): DriverWalletActivityItem {
  const amount = decimalToNumber(tx.amount);
  const signed = decimalToNumber(tx.balance_after) - decimalToNumber(tx.balance_before);
  const publicNumber = tx.ride?.public_number ?? null;
  const display_code = codeOrNull(publicNumber);
  const pickup = placeLabel(tx.ride?.pickup_address);
  const destination = placeLabel(tx.ride?.original_destination_address);
  return {
    id: tx.id,
    kind: tx.type,
    amount,
    signed_amount: signed,
    created_at: tx.created_at,
    ride_id: tx.ride_id,
    public_number: publicNumber,
    display_code,
    pickup_label: tx.type === GoWalletTransactionType.COMMISSION_DEDUCTION ? pickup : null,
    destination_label: tx.type === GoWalletTransactionType.COMMISSION_DEDUCTION ? destination : null,
    ...ledgerTitles(tx.type, display_code),
  };
}

/** Newest first; stable tie-break by id. */
export function mergeActivityItems(
  a: DriverWalletActivityItem[],
  b: DriverWalletActivityItem[],
): DriverWalletActivityItem[] {
  return [...a, ...b].sort((left, right) => {
    const dt = right.created_at.getTime() - left.created_at.getTime();
    if (dt !== 0) return dt;
    return right.id.localeCompare(left.id);
  });
}
