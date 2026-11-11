import { Prisma } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import type { PrismaService } from '../../../infra/prisma/prisma.service';

export const BROADCAST_AUDIENCES = ['ALL', 'DRIVERS', 'CUSTOMERS', 'STAFF'] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

export const BROADCAST_FILTERS = [
  'CUSTOMER_BIRTHDAY_TODAY',
  'CUSTOMER_TOP_ORDERS',
  'CUSTOMER_BOTTOM_ORDERS',
  'CUSTOMER_TOP_POINTS',
  'DRIVER_TOP_RATING',
  'DRIVER_BIRTHDAY_TODAY',
] as const;

export type BroadcastFilter = (typeof BROADCAST_FILTERS)[number];

export const DEFAULT_AUDIENCE_LIMIT = 10;
export const MAX_AUDIENCE_LIMIT = 100;

export type AudiencePreviewPerson = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  metric: number | null;
  metric_label: string;
};

export type AudiencePreview = {
  filter: BroadcastFilter;
  limit: number | null;
  audience: BroadcastAudience;
  total: number;
  items: AudiencePreviewPerson[];
};

type BirthdayRow = { user_id: string; full_name: string | null; phone: string | null };

/** Month/day in Asia/Damascus (app ops timezone). */
export function todayMonthDay(now = new Date()): { month: number; day: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Damascus',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? '1');
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? '1');
  return { month, day, date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

export function clampAudienceLimit(raw: number | undefined | null, required: boolean): number | null {
  if (raw == null || Number.isNaN(Number(raw))) {
    if (required) return DEFAULT_AUDIENCE_LIMIT;
    return null;
  }
  const n = Math.trunc(Number(raw));
  if (n < 1) {
    throw new GoException(GoErrorCode.VALIDATION_ERROR, 'limit must be at least 1');
  }
  return Math.min(n, MAX_AUDIENCE_LIMIT);
}

export function audienceForFilter(filter: BroadcastFilter): BroadcastAudience {
  return filter.startsWith('DRIVER_') ? 'DRIVERS' : 'CUSTOMERS';
}

export function assertFilterAudience(filter: BroadcastFilter | undefined | null, audience: BroadcastAudience) {
  if (!filter) return;
  const expected = audienceForFilter(filter);
  if (audience !== expected) {
    throw new GoException(
      GoErrorCode.VALIDATION_ERROR,
      `filter ${filter} requires audience ${expected}`,
    );
  }
}

function rankedRequired(filter: BroadcastFilter) {
  return (
    filter === 'CUSTOMER_TOP_ORDERS' ||
    filter === 'CUSTOMER_BOTTOM_ORDERS' ||
    filter === 'CUSTOMER_TOP_POINTS' ||
    filter === 'DRIVER_TOP_RATING'
  );
}

export async function resolveAudiencePreview(
  prisma: PrismaService,
  filter: BroadcastFilter,
  limitRaw?: number | null,
): Promise<AudiencePreview> {
  const limit = clampAudienceLimit(limitRaw, rankedRequired(filter));
  const audience = audienceForFilter(filter);
  const items = await resolveAudiencePeople(prisma, filter, limit);
  return { filter, limit, audience, total: items.length, items };
}

export async function resolveAudienceUserIds(
  prisma: PrismaService,
  filter: BroadcastFilter,
  limitRaw?: number | null,
): Promise<string[]> {
  const people = await resolveAudiencePeople(
    prisma,
    filter,
    clampAudienceLimit(limitRaw, rankedRequired(filter)),
  );
  return people.map((p) => p.user_id);
}

async function resolveAudiencePeople(
  prisma: PrismaService,
  filter: BroadcastFilter,
  limit: number | null,
): Promise<AudiencePreviewPerson[]> {
  switch (filter) {
    case 'CUSTOMER_BIRTHDAY_TODAY':
      return birthdayCustomers(prisma, limit);
    case 'DRIVER_BIRTHDAY_TODAY':
      return birthdayDrivers(prisma, limit);
    case 'CUSTOMER_TOP_ORDERS':
      return rankedCustomers(prisma, 'orders', 'desc', limit ?? DEFAULT_AUDIENCE_LIMIT);
    case 'CUSTOMER_BOTTOM_ORDERS':
      return rankedCustomers(prisma, 'orders', 'asc', limit ?? DEFAULT_AUDIENCE_LIMIT);
    case 'CUSTOMER_TOP_POINTS':
      return rankedCustomers(prisma, 'points', 'desc', limit ?? DEFAULT_AUDIENCE_LIMIT);
    case 'DRIVER_TOP_RATING':
      return topRatedDrivers(prisma, limit ?? DEFAULT_AUDIENCE_LIMIT);
    default:
      throw new GoException(GoErrorCode.VALIDATION_ERROR, 'Unknown audience filter');
  }
}

async function birthdayCustomers(prisma: PrismaService, limit: number | null): Promise<AudiencePreviewPerson[]> {
  const { month, day } = todayMonthDay();
  const rows = await prisma.$queryRaw<BirthdayRow[]>`
    SELECT u.id AS user_id, u.full_name, u.phone
    FROM go_customer_profiles c
    INNER JOIN users u ON u.id = c.user_id
    WHERE c.date_of_birth IS NOT NULL
      AND u.role = 'CUSTOMER'::"GoRole"
      AND u.is_active = true
      AND EXTRACT(MONTH FROM c.date_of_birth) = ${month}
      AND EXTRACT(DAY FROM c.date_of_birth) = ${day}
    ORDER BY u.full_name ASC NULLS LAST, u.phone ASC
    ${limit != null ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
  `;
  return rows.map((r) => ({
    user_id: r.user_id,
    full_name: r.full_name,
    phone: r.phone,
    metric: null,
    metric_label: 'birthday',
  }));
}

async function birthdayDrivers(prisma: PrismaService, limit: number | null): Promise<AudiencePreviewPerson[]> {
  const { month, day } = todayMonthDay();
  const rows = await prisma.$queryRaw<BirthdayRow[]>`
    SELECT u.id AS user_id, u.full_name, u.phone
    FROM go_driver_profiles d
    INNER JOIN users u ON u.id = d.user_id
    WHERE d.date_of_birth IS NOT NULL
      AND u.role = 'DRIVER'::"GoRole"
      AND u.is_active = true
      AND d.is_suspended = false
      AND EXTRACT(MONTH FROM d.date_of_birth) = ${month}
      AND EXTRACT(DAY FROM d.date_of_birth) = ${day}
    ORDER BY u.full_name ASC NULLS LAST, u.phone ASC
    ${limit != null ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
  `;
  return rows.map((r) => ({
    user_id: r.user_id,
    full_name: r.full_name,
    phone: r.phone,
    metric: null,
    metric_label: 'birthday',
  }));
}

type RankedCustomerRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  metric: number;
};

async function rankedCustomers(
  prisma: PrismaService,
  kind: 'orders' | 'points',
  direction: 'asc' | 'desc',
  limit: number,
): Promise<AudiencePreviewPerson[]> {
  const metricExpr =
    kind === 'orders'
      ? Prisma.sql`COALESCE(p.completed_rides, 0)`
      : Prisma.sql`COALESCE(p.hidden_score, 0)`;
  const order = direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const rows = await prisma.$queryRaw<RankedCustomerRow[]>`
    SELECT u.id AS user_id, u.full_name, u.phone, ${metricExpr}::int AS metric
    FROM users u
    INNER JOIN go_customer_profiles c ON c.user_id = u.id
    LEFT JOIN go_customer_passports p ON p.customer_id = c.id
    WHERE u.role = 'CUSTOMER'::"GoRole"
      AND u.is_active = true
    ORDER BY metric ${order}, u.full_name ASC NULLS LAST, u.phone ASC
    LIMIT ${limit}
  `;
  const metric_label = kind === 'orders' ? 'completed_rides' : 'points';
  return rows.map((r) => ({
    user_id: r.user_id,
    full_name: r.full_name,
    phone: r.phone,
    metric: Number(r.metric),
    metric_label,
  }));
}

type RatedDriverRow = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  metric: number;
  rating_count: number;
};

async function topRatedDrivers(prisma: PrismaService, limit: number): Promise<AudiencePreviewPerson[]> {
  const rows = await prisma.$queryRaw<RatedDriverRow[]>`
    SELECT
      u.id AS user_id,
      u.full_name,
      u.phone,
      AVG(r.stars)::float8 AS metric,
      COUNT(*)::int AS rating_count
    FROM go_ride_ratings r
    INNER JOIN users u ON u.id = r.to_user_id
    INNER JOIN go_driver_profiles d ON d.user_id = u.id
    WHERE r.direction = 'CUSTOMER_TO_DRIVER'::"GoRatingDirection"
      AND u.role = 'DRIVER'::"GoRole"
      AND u.is_active = true
      AND d.is_suspended = false
    GROUP BY u.id, u.full_name, u.phone
    ORDER BY metric DESC, rating_count DESC, u.full_name ASC NULLS LAST
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    user_id: r.user_id,
    full_name: r.full_name,
    phone: r.phone,
    metric: Math.round(Number(r.metric) * 100) / 100,
    metric_label: 'rating_avg',
  }));
}

export async function birthdaysToday(prisma: PrismaService) {
  const { date } = todayMonthDay();
  const [customers, drivers] = await Promise.all([
    birthdayCustomers(prisma, null),
    birthdayDrivers(prisma, null),
  ]);
  return {
    date,
    customers,
    drivers,
    customer_count: customers.length,
    driver_count: drivers.length,
  };
}
