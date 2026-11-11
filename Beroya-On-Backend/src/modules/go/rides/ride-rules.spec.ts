import { GoRideRequirementType, GoServiceCode } from '@/generated/prisma/client';
import { requirementsForCategory, vehicleCategoryIds, vehicleMatchesRideCategory } from './ride-rules';

describe('category requirements', () => {
  it('forces FEMALE_DRIVER on WOMEN even when the app sends nothing', () => {
    expect(requirementsForCategory('WOMEN')).toEqual([GoRideRequirementType.FEMALE_DRIVER]);
  });

  it('merges with requested requirements without duplicates', () => {
    expect(
      requirementsForCategory('WOMEN', [GoRideRequirementType.CHILD_SEAT, GoRideRequirementType.FEMALE_DRIVER]),
    ).toEqual([GoRideRequirementType.CHILD_SEAT, GoRideRequirementType.FEMALE_DRIVER]);
  });

  it('leaves other categories as requested', () => {
    expect(requirementsForCategory('TAXI', [GoRideRequirementType.CHILD_SEAT])).toEqual([
      GoRideRequirementType.CHILD_SEAT,
    ]);
    expect(requirementsForCategory('ECONOMY')).toEqual([]);
  });

  it('forces ACCESSIBILITY when service_type is ACCESSIBILITY', () => {
    expect(
      requirementsForCategory('ECONOMY', [GoRideRequirementType.WHEELCHAIR], GoServiceCode.ACCESSIBILITY),
    ).toEqual([GoRideRequirementType.WHEELCHAIR, GoRideRequirementType.ACCESSIBILITY]);
    expect(requirementsForCategory('ECONOMY', [], GoServiceCode.ACCESSIBILITY)).toEqual([
      GoRideRequirementType.ACCESSIBILITY,
    ]);
  });
});

describe('vehicleMatchesRideCategory', () => {
  it('matches the same category id', () => {
    expect(vehicleMatchesRideCategory('cat-vip', 'cat-vip')).toBe(true);
  });

  it('matches when the ride category is in the vehicle set', () => {
    expect(vehicleMatchesRideCategory(['cat-economy', 'cat-vip'], 'cat-vip')).toBe(true);
    expect(vehicleMatchesRideCategory(['cat-economy'], 'cat-vip')).toBe(false);
  });

  it('rejects mismatch and missing vehicle category', () => {
    expect(vehicleMatchesRideCategory('cat-economy', 'cat-vip')).toBe(false);
    expect(vehicleMatchesRideCategory(null, 'cat-vip')).toBe(false);
    expect(vehicleMatchesRideCategory(undefined, 'cat-vip')).toBe(false);
    expect(vehicleMatchesRideCategory('', 'cat-vip')).toBe(false);
    expect(vehicleMatchesRideCategory([], 'cat-vip')).toBe(false);
  });
});

describe('vehicleCategoryIds', () => {
  it('merges join rows with legacy singular id', () => {
    expect(
      vehicleCategoryIds({
        ride_category_id: 'a',
        ride_categories: [{ ride_category_id: 'b' }, { ride_category_id: 'a' }],
      }),
    ).toEqual(['b', 'a']);
  });
});
