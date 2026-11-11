import { rideDisplayCode } from './ride-display-code';

describe('rideDisplayCode', () => {
  it('maps GO public_number suffix to TRP-XXXX', () => {
    expect(rideDisplayCode('GO-20261020-00001')).toBe('TRP-0001');
    expect(rideDisplayCode('GO-20261020-04589')).toBe('TRP-4589');
  });

  it('handles short / bare numbers', () => {
    expect(rideDisplayCode('4821')).toBe('TRP-4821');
    expect(rideDisplayCode('89')).toBe('TRP-0089');
  });

  it('falls back for empty', () => {
    expect(rideDisplayCode(null)).toBe('TRP-0000');
    expect(rideDisplayCode('')).toBe('TRP-0000');
  });
});
