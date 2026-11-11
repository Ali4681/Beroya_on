import { ConfigService } from '@nestjs/config';
import { encodePolyline, selectedRouteId } from './polyline';
import { RouteEstimateService } from './route-estimate.service';

const a = { lat: 33.5138, lng: 36.2765 };
const b = { lat: 33.522, lng: 36.29 };

function config(osrmUrl: string, googleMapsApiKey = '') {
  return {
    get: (key: string) => {
      if (key === 'app.routing.osrmUrl') return osrmUrl;
      if (key === 'app.routing.googleMapsApiKey') return googleMapsApiKey;
      return undefined;
    },
  } as ConfigService;
}

describe('road route estimate', () => {
  it('uses Google Routes alternatives when a key is set', async () => {
    const service = new RouteEstimateService(config('', 'test-key'));
    service.useFetch(async (url, init) => {
      expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
      expect(init?.method).toBe('POST');
      expect(init?.headers?.['X-Goog-Api-Key']).toBe('test-key');
      const body = JSON.parse(init?.body ?? '{}') as { computeAlternativeRoutes?: boolean };
      expect(body.computeAlternativeRoutes).toBe(true);
      return {
        ok: true,
        json: async () => ({
          routes: [
            {
              description: 'Via 1',
              polyline: { encodedPolyline: 'abc' },
              distanceMeters: 2100,
              duration: '300s',
            },
            {
              description: 'Via 2',
              polyline: { encodedPolyline: 'def' },
              distanceMeters: 2500,
              duration: '280s',
            },
          ],
        }),
      };
    });
    const { source, routes } = await service.estimateOptions([a, b], true);
    expect(source).toBe('google');
    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({
      summary: 'Via 1',
      distance_m: 2100,
      duration_sec: 300,
      encoded_polyline: 'abc',
      source: 'google',
      route_id: selectedRouteId('abc', 2100, 300),
    });
  });

  it('uses an OSRM route when Google is unset and the router answers', async () => {
    const service = new RouteEstimateService(config('https://router.example'));
    service.useFetch(async () => ({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ distance: 2400.4, duration: 410.2, geometry: 'osrmpoly' }] }),
    }));
    const estimate = await service.estimate([a, b]);
    expect(estimate).toMatchObject({
      distance_m: 2400,
      duration_sec: 410,
      source: 'osrm',
      encoded_polyline: 'osrmpoly',
    });
  });

  it('falls back to OSRM when Google fails', async () => {
    const service = new RouteEstimateService(config('https://router.example', 'test-key'));
    service.useFetch(async (url) => {
      if (String(url).includes('routes.googleapis.com')) {
        return {
          ok: false,
          json: async () => ({ error: { status: 'PERMISSION_DENIED', message: 'REQUEST_DENIED' } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ code: 'Ok', routes: [{ distance: 1800, duration: 200, geometry: 'x' }] }),
      };
    });
    const estimate = await service.estimate([a, b]);
    expect(estimate.source).toBe('osrm');
    expect(estimate.distance_m).toBe(1800);
  });

  it('falls back when the router fails', async () => {
    const service = new RouteEstimateService(config('https://router.example'));
    service.useFetch(async () => {
      throw new Error('down');
    });
    const estimate = await service.estimate([a, b]);
    expect(estimate.source).toBe('fallback');
    expect(estimate.distance_m).toBeGreaterThan(0);
    expect(estimate.duration_sec).toBeGreaterThanOrEqual(60);
    expect(estimate.encoded_polyline).toBe(encodePolyline([a, b]));
  });

  it('skips the network when no router is configured', async () => {
    const service = new RouteEstimateService(config(''));
    let called = false;
    service.useFetch(async () => {
      called = true;
      return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 1, duration: 1 }] }) };
    });
    const estimate = await service.estimate([a, b]);
    expect(called).toBe(false);
    expect(estimate.source).toBe('fallback');
  });
});
