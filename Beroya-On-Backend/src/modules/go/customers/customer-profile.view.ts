import { Injectable } from '@nestjs/common';
import { GoDriverGender, GoLanguage, Prisma } from '@/generated/prisma/client';
import { ObjectStorageService } from '../../../infra/object-storage/object-storage.service';
import { KeyedImageStorage } from '../files/keyed-image.storage';

/** Display preference only; fares and the wallet stay in SYP. */
export const CUSTOMER_CURRENCIES = ['SYP', 'USD'] as const;

@Injectable()
export class CustomerAvatarStorage extends KeyedImageStorage {
  protected readonly folder = 'customer-avatars';

  constructor(objects: ObjectStorageService) {
    super(objects);
  }
}

export const customerProfileInclude = {
  user: { select: { id: true, phone: true, full_name: true, is_active: true, created_at: true } },
  selected_city: { select: { id: true, name_ar: true, name_en: true, is_active: true } },
} satisfies Prisma.GoCustomerProfileInclude;

type CustomerProfileRow = Prisma.GoCustomerProfileGetPayload<{ include: typeof customerProfileInclude }>;

/** Customer-editable fields, returned by GET /customer/profile and merged into /auth/me for customers. */
export function customerPersonalFields(profile: {
  email: string | null;
  city: string | null;
  city_id: string | null;
  selected_city?: { id: string; name_ar: string; name_en: string | null; is_active: boolean } | null;
  gender: GoDriverGender;
  date_of_birth: Date | null;
  preferred_currency: string;
  preferred_language: GoLanguage;
  avatar_key: string | null;
  updated_at: Date;
}) {
  const lang = profile.preferred_language ?? GoLanguage.AR;
  const cityName =
    profile.selected_city == null
      ? profile.city
      : lang === GoLanguage.EN
        ? (profile.selected_city.name_en ?? profile.selected_city.name_ar)
        : profile.selected_city.name_ar;
  return {
    email: profile.email,
    city_id: profile.city_id,
    city: cityName,
    gender: profile.gender,
    date_of_birth: profile.date_of_birth ? profile.date_of_birth.toISOString().slice(0, 10) : null,
    preferred_currency: profile.preferred_currency,
    preferred_language: lang,
    avatar_url: profile.avatar_key
      ? `/api/v1/go/customer/profile/avatar?v=${profile.updated_at.getTime()}`
      : null,
  };
}

export function customerProfileView(profile: CustomerProfileRow) {
  return {
    id: profile.id,
    user_id: profile.user_id,
    phone: profile.user.phone,
    full_name: profile.user.full_name,
    ...customerPersonalFields(profile),
    is_active: profile.user.is_active,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
    user: profile.user,
  };
}
