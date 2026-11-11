import {
  DEFAULT_DRIVER_OFFER_RADIUS_M,
  DRIVER_OFFER_RADIUS_MAX_M,
  DRIVER_OFFER_RADIUS_MIN_M,
  driverOfferSearchRadii,
  isWithinDriverOfferRadius,
  normalizeDriverOfferRadiusM,
} from './offer-radius';

describe('offer-radius (Option A)', () => {
  it('normalizes and clamps driver_offer_radius_m', () => {
    expect(normalizeDriverOfferRadiusM(500)).toBe(500);
    expect(normalizeDriverOfferRadiusM(199)).toBe(DRIVER_OFFER_RADIUS_MIN_M);
    expect(normalizeDriverOfferRadiusM(9000)).toBe(DRIVER_OFFER_RADIUS_MAX_M);
    expect(normalizeDriverOfferRadiusM('bad')).toBe(DEFAULT_DRIVER_OFFER_RADIUS_M);
  });

  it('uses a single search radius equal to the offer circle', () => {
    expect(driverOfferSearchRadii(500)).toEqual([500]);
    expect(driverOfferSearchRadii(800)).toEqual([800]);
  });

  it('filters distance against the offer circle', () => {
    expect(isWithinDriverOfferRadius(450, 500)).toBe(true);
    expect(isWithinDriverOfferRadius(500, 500)).toBe(true);
    expect(isWithinDriverOfferRadius(501, 500)).toBe(false);
  });
});
