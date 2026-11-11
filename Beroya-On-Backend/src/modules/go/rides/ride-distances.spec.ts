import { GoRideStatus } from '@/generated/prisma/client';
import {
  destinationChanged,
  plannedTripDistanceM,
  resolveToCustomerDistanceM,
  toDestinationDistanceM,
  toPickupHaversineM,
  withCustomerDistanceM,
} from './ride-distances';

describe('ride-distances', () => {
  it('separates planned trip from with-customer GPS distance', () => {
    expect(plannedTripDistanceM({ estimated_distance_m: 5000 })).toBe(5000);
    expect(withCustomerDistanceM({ actual_distance_m: 7200 })).toBe(7200);
    expect(withCustomerDistanceM({ actual_distance_m: null })).toBeNull();
    expect(toDestinationDistanceM({ actual_distance_m: 7200, estimated_distance_m: 5000 })).toBe(7200);
    expect(toDestinationDistanceM({ actual_distance_m: null, estimated_distance_m: 5000 })).toBe(5000);
  });

  it('resolves to-customer distance by status', () => {
    expect(
      resolveToCustomerDistanceM({
        status: GoRideStatus.ARRIVED,
        storedToPickupM: 3000,
        livePickupDistanceM: 100,
      }),
    ).toBe(0);
    expect(
      resolveToCustomerDistanceM({
        status: GoRideStatus.DRIVER_EN_ROUTE,
        storedToPickupM: 3000,
        livePickupDistanceM: 1200,
      }),
    ).toBe(1200);
    expect(
      resolveToCustomerDistanceM({
        status: GoRideStatus.COMPLETED,
        storedToPickupM: 3000,
        livePickupDistanceM: null,
      }),
    ).toBe(3000);
  });

  it('detects destination change beyond threshold', () => {
    expect(
      destinationChanged({
        original_destination_lat: 33.51,
        original_destination_lng: 36.29,
        actual_dropoff_lat: 33.51,
        actual_dropoff_lng: 36.29,
      }),
    ).toBe(false);
    expect(
      destinationChanged({
        original_destination_lat: 33.51,
        original_destination_lng: 36.29,
        actual_dropoff_lat: 33.53,
        actual_dropoff_lng: 36.31,
      }),
    ).toBe(true);
  });

  it('computes haversine to pickup', () => {
    const meters = toPickupHaversineM({ lat: 33.51, lng: 36.29 }, { lat: 33.52, lng: 36.3 });
    expect(meters).toBeGreaterThan(1000);
    expect(meters).toBeLessThan(3000);
    expect(toPickupHaversineM(null, { lat: 33.51, lng: 36.29 })).toBeNull();
  });
});
