import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { encodePolyline, selectedRouteId, type LatLng } from './polyline';

export type { LatLng } from './polyline';

export type RouteSource = 'google' | 'osrm' | 'fallback';

export interface RouteOption {
  route_id: string;
  summary: string;
  distance_m: number;
  duration_sec: number;
  encoded_polyline: string;
  source: RouteSource;
}

export interface RouteEstimate extends RouteOption {}

export interface RouteOptionsResult {
  source: RouteSource;
  routes: RouteOption[];
}

type FetchLike = (
  url: string,
  init?: { method?: string; signal?: AbortSignal; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/**
 * Primary: Google Routes API v2 (`computeRoutes`, alternatives when requested).
 * Fallback: OSRM, then haversine × 1.3 at 30 km/h.
 */
@Injectable()
export class RouteEstimateService {
  private readonly logger = new Logger(RouteEstimateService.name);
  private readonly cache = new Map<string, { at: number; value: RouteOptionsResult }>();
  private fetchImpl: FetchLike = globalThis.fetch.bind(globalThis);

  constructor(private readonly config: ConfigService) {}

  useFetch(fetchImpl: FetchLike) {
    this.fetchImpl = fetchImpl;
  }

  async estimate(points: LatLng[]): Promise<RouteEstimate> {
    const { routes } = await this.estimateOptions(points, false);
    return routes[0];
  }

  async estimateOptions(points: LatLng[], alternatives: boolean): Promise<RouteOptionsResult> {
    if (points.length < 2) {
      const empty = this.toOption({ distance_m: 0, duration_sec: 0, source: 'fallback', encoded_polyline: '', summary: '' });
      return { source: 'fallback', routes: [empty] };
    }
    const key = `${alternatives ? 'alt' : 'one'}:${points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';')}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < 60_000) return hit.value;

    const google = await this.fromGoogle(points, alternatives);
    const osrm = google ? null : await this.fromOsrm(points);
    const routes = google ?? osrm ?? [this.fallback(points)];
    const value: RouteOptionsResult = { source: routes[0].source, routes };
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  fallback(points: LatLng[]): RouteOption {
    if (points.length < 2) {
      return this.toOption({ distance_m: 0, duration_sec: 0, source: 'fallback', encoded_polyline: '', summary: '' });
    }
    let meters = 0;
    for (let i = 1; i < points.length; i++) meters += haversineM(points[i - 1], points[i]);
    const roadMeters = Math.round(meters * 1.3);
    const duration_sec = Math.max(60, Math.round((roadMeters / 1000 / 30) * 3600));
    return this.toOption({
      distance_m: roadMeters,
      duration_sec,
      source: 'fallback',
      encoded_polyline: encodePolyline(points),
      summary: '',
    });
  }

  private routing() {
    const nested = this.config.get<{ osrmUrl?: string; googleMapsApiKey?: string }>('app.routing');
    return {
      osrmUrl: nested?.osrmUrl ?? this.config.get<string>('app.routing.osrmUrl') ?? '',
      googleMapsApiKey: nested?.googleMapsApiKey ?? this.config.get<string>('app.routing.googleMapsApiKey') ?? '',
    };
  }

  private async fromGoogle(points: LatLng[], alternatives: boolean): Promise<RouteOption[] | null> {
    const key = this.routing().googleMapsApiKey?.trim();
    if (!key) return null;
    const middle = points.slice(1, -1);
    const waypoint = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
    const body = {
      origin: waypoint(points[0]),
      destination: waypoint(points[points.length - 1]),
      travelMode: 'DRIVE',
      languageCode: 'ar',
      // Google only returns alternatives when there are no intermediates.
      computeAlternativeRoutes: Boolean(alternatives && middle.length === 0),
      ...(middle.length ? { intermediates: middle.map(waypoint) } : {}),
    };
    const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask':
            'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description',
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as GoogleRoutesResponse;
      if (!response.ok || payload.error || !payload.routes?.length) {
        this.logger.warn(
          `Google Routes ${payload.error?.status ?? 'empty'}: ${payload.error?.message ?? 'no routes'}`,
        );
        return null;
      }
      const options = payload.routes
        .map((route) => {
          const encoded = route.polyline?.encodedPolyline ?? '';
          return this.toOption({
            distance_m: Math.max(0, Math.round(route.distanceMeters ?? 0)),
            duration_sec: Math.max(1, parseDurationSec(route.duration)),
            source: 'google',
            encoded_polyline: encoded || encodePolyline(points),
            summary: route.description ?? '',
          });
        })
        .filter((r) => r.encoded_polyline);
      return options.length ? options : null;
    } catch (err) {
      this.logger.warn(`Google Routes unavailable: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fromOsrm(points: LatLng[]): Promise<RouteOption[] | null> {
    const base = this.routing().osrmUrl?.replace(/\/$/, '');
    if (!base) return null;
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const url = `${base}/route/v1/driving/${coords}?overview=full&geometries=polyline`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const response = await this.fetchImpl(url, { signal: ctrl.signal });
      if (!response.ok) return null;
      const osrmBody = (await response.json()) as {
        code?: string;
        routes?: { distance?: number; duration?: number; geometry?: string }[];
      };
      const route = osrmBody.code === 'Ok' ? osrmBody.routes?.[0] : undefined;
      if (!route || typeof route.distance !== 'number' || typeof route.duration !== 'number') return null;
      return [
        this.toOption({
          distance_m: Math.max(0, Math.round(route.distance)),
          duration_sec: Math.max(1, Math.round(route.duration)),
          source: 'osrm',
          encoded_polyline: route.geometry ?? encodePolyline(points),
          summary: '',
        }),
      ];
    } catch (err) {
      this.logger.warn(`OSRM unavailable: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private toOption(input: {
    distance_m: number;
    duration_sec: number;
    source: RouteSource;
    encoded_polyline: string;
    summary: string;
  }): RouteOption {
    return {
      ...input,
      route_id: selectedRouteId(input.encoded_polyline, input.distance_m, input.duration_sec),
    };
  }
}

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type GoogleRoutesResponse = {
  error?: { status?: string; message?: string };
  routes?: {
    distanceMeters?: number;
    duration?: string;
    description?: string;
    polyline?: { encodedPolyline?: string };
  }[];
};

/** Routes API duration is a protobuf string like `327s`. */
function parseDurationSec(value?: string): number {
  if (!value) return 1;
  const match = /^([\d.]+)s$/.exec(value.trim());
  if (!match) return 1;
  return Math.max(1, Math.round(Number(match[1])));
}
