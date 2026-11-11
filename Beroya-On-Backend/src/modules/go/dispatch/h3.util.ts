import { gridDisk, latLngToCell } from 'h3-js';

/** H3 resolution for candidate discovery (~174m edge). Not equal to search radius. */
export const H3_RESOLUTION = 9;

/** Approx hex edge length (m) at H3_RESOLUTION — used only to size gridDisk k. */
const EDGE_M_RES9 = 174.4;

export function toH3Index(lat: number, lng: number, res = H3_RESOLUTION): string {
  return latLngToCell(lat, lng, res);
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
}

/** Like toH3Index but null for missing, out-of-range, or (0,0) coordinates. */
export function safeH3Index(lat: unknown, lng: unknown, res = H3_RESOLUTION): string | null {
  if (lat == null || lng == null || !isValidLatLng(lat, lng)) return null;
  try {
    return latLngToCell(Number(lat), Number(lng), res);
  } catch {
    return null;
  }
}

/** Cells covering a circle of radius_m around a point (over-approx; final filter is haversine). */
export function cellsForRadius(lat: number, lng: number, radiusM: number, res = H3_RESOLUTION): string[] {
  const origin = latLngToCell(lat, lng, res);
  const k = Math.max(1, Math.ceil(radiusM / (EDGE_M_RES9 * 1.5)));
  return gridDisk(origin, k);
}

/** Expand configured steps gradually up to max (Ticket §7.2 — no large jumps). */
export function expandRadiusSteps(steps: unknown, maxM: number): number[] {
  const base = Array.isArray(steps)
    ? steps.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n <= maxM)
    : [];
  const out = [...new Set(base)].sort((a, b) => a - b);
  if (out.length === 0) out.push(Math.min(500, maxM));
  let last = out[out.length - 1];
  while (last < maxM) {
    const increment = last < 2000 ? 200 : last < 3500 ? 300 : 400;
    const next = Math.min(maxM, last + increment);
    if (next <= last) break;
    out.push(next);
    last = next;
  }
  if (out[out.length - 1] < maxM) out.push(maxM);
  return out;
}

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
