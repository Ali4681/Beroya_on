/** Minimal GeoJSON point-in-polygon (ray casting). Supports Polygon and MultiPolygon. */

export type LngLat = { lng: number; lat: number };

function pointInRing(point: LngLat, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function pointInServiceArea(point: LngLat, serviceArea: unknown): boolean {
  if (!serviceArea || typeof serviceArea !== 'object') return false;
  const geo = serviceArea as { type?: string; coordinates?: unknown };
  if (geo.type === 'Polygon' && Array.isArray(geo.coordinates)) {
    const rings = geo.coordinates as number[][][];
    if (!rings[0] || !pointInRing(point, rings[0])) return false;
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(point, rings[i])) return false;
    }
    return true;
  }
  if (geo.type === 'MultiPolygon' && Array.isArray(geo.coordinates)) {
    return (geo.coordinates as number[][][][]).some((poly) =>
      pointInServiceArea(point, { type: 'Polygon', coordinates: poly }),
    );
  }
  return false;
}
