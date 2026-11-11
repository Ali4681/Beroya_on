import type { GoServiceCode } from '@/generated/prisma/client';

export type OfferServiceCard = {
  code: GoServiceCode | string;
  name_ar: string;
  name_en: string | null;
};

export type OfferRideCategoryCard = {
  id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
};

/** Top-level service + category cards shared by socket `ride.offer` and GET /driver/offers. */
export function offerServiceAndCategoryFields(input: {
  service_code: GoServiceCode | string;
  service?: OfferServiceCard | null;
  ride_category?: OfferRideCategoryCard | null;
}) {
  const service: OfferServiceCard = input.service
    ? {
        code: input.service.code,
        name_ar: input.service.name_ar,
        name_en: input.service.name_en ?? null,
      }
    : {
        code: input.service_code,
        name_ar: String(input.service_code),
        name_en: null,
      };

  const ride_category = input.ride_category
    ? {
        id: input.ride_category.id,
        code: input.ride_category.code,
        name_ar: input.ride_category.name_ar,
        name_en: input.ride_category.name_en ?? null,
      }
    : null;

  return {
    service_code: input.service_code,
    service,
    ride_category,
  };
}
