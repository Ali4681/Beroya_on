import { GoServiceCode } from '@/generated/prisma/client';
import { offerServiceAndCategoryFields } from './offer-display';

describe('offerServiceAndCategoryFields', () => {
  it('exposes service + ride_category cards for driver UI', () => {
    expect(
      offerServiceAndCategoryFields({
        service_code: GoServiceCode.ACCESSIBILITY,
        service: {
          code: GoServiceCode.ACCESSIBILITY,
          name_ar: 'ذوي احتياجات خاصة',
          name_en: 'Accessibility',
        },
        ride_category: {
          id: 'cat-1',
          code: 'VIP',
          name_ar: 'كبار الشخصيات',
          name_en: 'VIP',
        },
      }),
    ).toEqual({
      service_code: GoServiceCode.ACCESSIBILITY,
      service: {
        code: GoServiceCode.ACCESSIBILITY,
        name_ar: 'ذوي احتياجات خاصة',
        name_en: 'Accessibility',
      },
      ride_category: {
        id: 'cat-1',
        code: 'VIP',
        name_ar: 'كبار الشخصيات',
        name_en: 'VIP',
      },
    });
  });

  it('falls back when service row missing', () => {
    expect(
      offerServiceAndCategoryFields({
        service_code: GoServiceCode.RENTAL,
        service: null,
        ride_category: null,
      }),
    ).toEqual({
      service_code: GoServiceCode.RENTAL,
      service: { code: GoServiceCode.RENTAL, name_ar: 'RENTAL', name_en: null },
      ride_category: null,
    });
  });
});
