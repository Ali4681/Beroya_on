import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

import { encodePolyline } from '../src/modules/go/rides/polyline';

loadEnv({ path: resolve(__dirname, '../.env') });

export type SeedRoutePoint = { lat: number; lng: number };

export type SeedBookedRoute = {
  encoded_polyline: string;
  source: 'google' | 'fallback';
  summary: string;
  distance_m: number;
  duration_sec: number;
};

const cache = new Map<string, SeedBookedRoute>();
let googleDeniedLogged = false;
let googleOkLogged = false;

function googleMapsKey() {
  return (process.env.GOOGLE_MAPS_API_KEY ?? '').trim().replace(/^["']|["']$/g, '');
}

function routeKey(from: SeedRoutePoint, to: SeedRoutePoint) {
  return `${from.lat.toFixed(5)},${from.lng.toFixed(5)};${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;
}

function haversineM(a: SeedRoutePoint, b: SeedRoutePoint): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fallbackRoute(from: SeedRoutePoint, to: SeedRoutePoint): SeedBookedRoute {
  const meters = haversineM(from, to);
  const roadMeters = Math.round(meters * 1.3);
  return {
    encoded_polyline: encodePolyline([from, to]),
    source: 'fallback',
    summary: '',
    distance_m: Math.max(800, roadMeters),
    duration_sec: Math.max(60, Math.round((Math.max(800, roadMeters) / 1000 / 28) * 3600)),
  };
}

async function fromGoogle(from: SeedRoutePoint, to: SeedRoutePoint): Promise<SeedBookedRoute | null> {
  const key = googleMapsKey();
  if (!key) {
    if (!googleDeniedLogged) {
      googleDeniedLogged = true;
      console.warn('Seed routes: GOOGLE_MAPS_API_KEY is empty — using straight-line fallback');
    }
    return null;
  }

  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: 'DRIVE',
      languageCode: 'ar',
      polylineQuality: 'HIGH_QUALITY',
      computeAlternativeRoutes: false,
    }),
  });
  const body = (await response.json()) as {
    error?: { status?: string; message?: string };
    routes?: {
      description?: string;
      distanceMeters?: number;
      duration?: string;
      polyline?: { encodedPolyline?: string };
    }[];
  };
  if (!response.ok || body.error) {
    if (!googleDeniedLogged) {
      googleDeniedLogged = true;
      console.warn(`Seed routes: Google Routes ${body.error?.status ?? response.status}`);
    }
    return null;
  }
  const route = body.routes?.[0];
  const encoded = route?.polyline?.encodedPolyline;
  if (!encoded) return null;
  const durationMatch = typeof route.duration === 'string' ? /^(\d+(?:\.\d+)?)s$/.exec(route.duration) : null;
  if (!googleOkLogged) {
    googleOkLogged = true;
    console.log('Seed routes: using Google Routes API for booked map polylines');
  }
  return {
    encoded_polyline: encoded,
    source: 'google',
    summary: route.description ?? '',
    distance_m: Math.max(1, Math.round(route.distanceMeters ?? 0)),
    duration_sec: Math.max(1, durationMatch ? Math.round(Number(durationMatch[1])) : 1),
  };
}

/** Real road geometry for seed rides — Google Routes only (haversine fallback if Google fails). */
export async function seedBookedRoute(from: SeedRoutePoint, to: SeedRoutePoint): Promise<SeedBookedRoute> {
  const key = routeKey(from, to);
  const hit = cache.get(key);
  if (hit) return hit;
  const google = await fromGoogle(from, to);
  const route = google ?? fallbackRoute(from, to);
  cache.set(key, route);
  return route;
}
