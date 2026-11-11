import { distanceToPolylineM } from './monitoring.service';

describe('distanceToPolylineM', () => {
  it('is near zero when point lies on the segment', () => {
    const path = [
      { lat: 33.5, lng: 36.3 },
      { lat: 33.52, lng: 36.32 },
    ];
    const mid = { lat: 33.51, lng: 36.31 };
    expect(distanceToPolylineM(mid, path)).toBeLessThan(50);
  });

  it('grows when point is far from the route', () => {
    const path = [
      { lat: 33.5, lng: 36.3 },
      { lat: 33.52, lng: 36.32 },
    ];
    const far = { lat: 33.6, lng: 36.4 };
    expect(distanceToPolylineM(far, path)).toBeGreaterThan(500);
  });
});
