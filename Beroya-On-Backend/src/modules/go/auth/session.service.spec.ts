import { ttlToSeconds } from './session.service';

describe('ttlToSeconds', () => {
  it('parses common JWT TTL formats', () => {
    expect(ttlToSeconds('15m')).toBe(900);
    expect(ttlToSeconds('1h')).toBe(3600);
    expect(ttlToSeconds('30d')).toBe(2_592_000);
    expect(ttlToSeconds('900')).toBe(900);
  });
});
