import { GoServiceCode } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';

/** Category codes reserved for a single service (not shown on the DAILY picker). */
export const SERVICE_ONLY_CATEGORY_CODES: Partial<Record<GoServiceCode, readonly string[]>> = {
  [GoServiceCode.AMBULANCE]: ['AMBULANCE'],
};

const RESERVED_CATEGORY_CODES = new Set(
  Object.values(SERVICE_ONLY_CATEGORY_CODES).flatMap((codes) => [...codes]),
);

/** Active categories returned for a customer picker, filtered by booking service. */
export function categoryCodesForServiceList(serviceType?: GoServiceCode | string | null): string[] | 'default' {
  if (!serviceType || serviceType === GoServiceCode.DAILY) return 'default';
  const locked = SERVICE_ONLY_CATEGORY_CODES[serviceType as GoServiceCode];
  if (locked) return [...locked];
  // INTERCITY / ACCESSIBILITY / TOURIST / … share the DAILY vehicle classes.
  return 'default';
}

export function assertRideCategoryMatchesService(
  serviceCode: GoServiceCode,
  categoryCode: string,
): void {
  const locked = SERVICE_ONLY_CATEGORY_CODES[serviceCode];
  if (locked) {
    if (!locked.includes(categoryCode)) {
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: [
          {
            field: 'ride_category_id',
            messages: ['هذه الفئة غير مخصصة لخدمة الإسعاف'],
          },
        ],
      });
    }
    return;
  }
  if (RESERVED_CATEGORY_CODES.has(categoryCode)) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Validation failed', {
      errors: [
        {
          field: 'ride_category_id',
          messages: ['هذه الفئة غير مخصصة لهذه الخدمة'],
        },
      ],
    });
  }
}
