import { GoIncentiveKind, GoRideBonusStack, Prisma } from '@/generated/prisma/client';

type Num = Prisma.Decimal | number | string;

/** False when paying `amount` would push today's paid total past `cap`. A null cap never blocks. */
export function withinDailyCap(paidToday: Num, amount: Num, cap: Num | null | undefined) {
  if (cap == null) return true;
  return new Prisma.Decimal(paidToday).plus(amount).lte(cap);
}

function ringCentroid(ring: number[][]) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j];
    const [x1, y1] = ring[i];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area /= 2;
  return { area, lng: area ? cx / (6 * area) : NaN, lat: area ? cy / (6 * area) : NaN };
}

/** Area-weighted centre of a GeoJSON Polygon/MultiPolygon (outer rings). Null when there is no usable shape. */
export function serviceAreaCentroid(serviceArea: unknown): { lat: number; lng: number } | null {
  if (!serviceArea || typeof serviceArea !== 'object') return null;
  const geo = serviceArea as { type?: string; coordinates?: unknown };
  const polygons =
    geo.type === 'Polygon' ? [geo.coordinates as number[][][]] : geo.type === 'MultiPolygon' ? (geo.coordinates as number[][][][]) : [];
  const rings = polygons.map((p) => p?.[0]).filter((r): r is number[][] => Array.isArray(r) && r.length >= 3);
  if (!rings.length) return null;
  let total = 0;
  let lat = 0;
  let lng = 0;
  for (const ring of rings) {
    const c = ringCentroid(ring);
    if (!c.area || !Number.isFinite(c.lat)) continue;
    const w = Math.abs(c.area);
    total += w;
    lat += c.lat * w;
    lng += c.lng * w;
  }
  if (total > 0) return { lat: lat / total, lng: lng / total };
  const points = rings.flat();
  return {
    lat: points.reduce((s, p) => s + p[1], 0) / points.length,
    lng: points.reduce((s, p) => s + p[0], 0) / points.length,
  };
}

export interface RideBonusPart {
  kind: GoIncentiveKind;
  pct: Num | null | undefined;
  cap: Num | null | undefined;
}

const REASON: Partial<Record<GoIncentiveKind, string>> = {
  RIDE_REJECTION: 'REJECTION',
  RIDE_DISTANCE: 'DISTANCE',
};

/** Ride-level percentage and reason shown to drivers (before caps). */
export function combineRideBonus(parts: RideBonusPart[], stack: GoRideBonusStack) {
  const active = parts.filter((p) => p.pct != null && new Prisma.Decimal(p.pct).gt(0));
  if (!active.length) return { percentage: null, reason: null };
  if (stack === GoRideBonusStack.SUM) {
    const sum = active.reduce((s, p) => s.plus(p.pct!), new Prisma.Decimal(0));
    return { percentage: sum, reason: active.map((p) => REASON[p.kind]).join('+') };
  }
  const best = active.reduce((a, b) => (new Prisma.Decimal(b.pct!).gt(a.pct!) ? b : a));
  return { percentage: new Prisma.Decimal(best.pct!), reason: REASON[best.kind] ?? null };
}

export type StreakEvent = { at: Date; type: 'COMPLETED' | 'BREAK' };

/**
 * Walks events in time order: a counted completed ride adds one, a break (decline, expiry, driver cancel)
 * resets to zero. `current` is the run still open after the last event.
 */
export function longestCleanStreak(events: StreakEvent[]) {
  const ordered = [...events].sort((a, b) => a.at.getTime() - b.at.getTime() || (a.type === 'BREAK' ? -1 : 1));
  let current = 0;
  let longest = 0;
  for (const event of ordered) {
    current = event.type === 'COMPLETED' ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return { longest, current };
}

/** Amount of one part: gross × pct%, limited by its cap. */
export function partAmount(gross: Num, pct: Num, cap: Num | null | undefined) {
  const raw = new Prisma.Decimal(gross).times(pct).div(100).toDecimalPlaces(2);
  return cap != null && raw.gt(cap) ? new Prisma.Decimal(cap) : raw;
}

/** What to pay on completion: MAX pays the largest capped part, SUM pays every part. */
export function rideBonusPayouts(gross: Num, parts: RideBonusPart[], stack: GoRideBonusStack) {
  const paid = parts
    .filter((p) => p.pct != null && new Prisma.Decimal(p.pct).gt(0))
    .map((p) => ({ kind: p.kind, pct: new Prisma.Decimal(p.pct!), amount: partAmount(gross, p.pct!, p.cap) }))
    .filter((p) => p.amount.gt(0));
  if (stack === GoRideBonusStack.SUM || paid.length <= 1) return paid;
  return [paid.reduce((a, b) => (b.amount.gt(a.amount) ? b : a))];
}
