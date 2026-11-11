import { createHash } from 'crypto';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Google encoded polyline (precision 5). */
export function encodePolyline(points: LatLng[]): string {
  let prevLat = 0;
  let prevLng = 0;
  let out = '';
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    out += encodeSigned(lat - prevLat);
    out += encodeSigned(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const dLat = decodeChunk(encoded, index);
    index = dLat.next;
    lat += dLat.value;
    const dLng = decodeChunk(encoded, index);
    index = dLng.next;
    lng += dLng.value;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

export function subsamplePath(points: LatLng[], maxPoints = 200): LatLng[] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const out: LatLng[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

export function selectedRouteId(polyline: string, distanceM: number, durationSec: number): string {
  return createHash('sha256').update(`${polyline}|${distanceM}|${durationSec}`).digest('hex').slice(0, 16);
}

function encodeSigned(value: number): string {
  let n = value < 0 ? ~(value << 1) : value << 1;
  let chunk = '';
  while (n >= 0x20) {
    chunk += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
    n >>= 5;
  }
  chunk += String.fromCharCode(n + 63);
  return chunk;
}

function decodeChunk(encoded: string, start: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let index = start;
  let b: number;
  do {
    b = encoded.charCodeAt(index++) - 63;
    result |= (b & 0x1f) << shift;
    shift += 5;
  } while (b >= 0x20);
  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return { value, next: index };
}
