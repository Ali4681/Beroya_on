import { pointInServiceArea } from './branch-geo.util';

describe('pointInServiceArea', () => {
  const damascus = {
    type: 'Polygon',
    coordinates: [
      [
        [36.2, 33.4],
        [36.4, 33.4],
        [36.4, 33.6],
        [36.2, 33.6],
        [36.2, 33.4],
      ],
    ],
  };

  it('detects point inside polygon', () => {
    expect(pointInServiceArea({ lng: 36.3, lat: 33.5 }, damascus)).toBe(true);
  });

  it('detects point outside polygon', () => {
    expect(pointInServiceArea({ lng: 37.1, lat: 36.2 }, damascus)).toBe(false);
  });
});
