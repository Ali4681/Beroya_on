import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoBookingFor, GoLanguage } from '@/generated/prisma/client';
import { GoErrorCode } from '../../../common/errors/go-error-codes';
import { GoException } from '../../../common/errors/go.exception';
import type { AppConfig } from '../../../config/configuration';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { DriverAvatarStorage } from '../drivers/driver-avatar.storage';
import { passportIconMime } from '../passport/passport-icon.storage';
import { customerRideInclude, CustomerRideViewService } from '../rides/customer-ride-view.service';
import { rideVehicle } from '../rides/ride-driver-card';
import { isTrackableStatus, TRACKING_TOKEN_FORMAT } from '../rides/ride-tracking-link';
import type { TrackingPageLang } from './tracking-page';

/**
 * Read-only view of a ride for whoever holds its tracking link.
 * Never returns a phone number (customer, passenger or driver) or internal ids.
 */
@Injectable()
export class PublicTrackingService {
  private readonly apiBase: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rideView: CustomerRideViewService,
    private readonly avatars: DriverAvatarStorage,
    config: ConfigService,
  ) {
    const app = config.getOrThrow<AppConfig>('app');
    // Relative to the API host — APP_PUBLIC_URL is the website (tracking page), not the API.
    this.apiBase = `/${app.apiPrefix}`;
  }

  async view(token: string) {
    const ride = await this.rideFor(token);
    const tracking = await this.rideView.tracking(ride);
    const vehicle = ride.driver ? rideVehicle(ride.vehicle_snapshot) : null;
    return {
      status: ride.status,
      passenger_name:
        ride.booking_for === GoBookingFor.OTHER ? ride.other_passenger_name : (ride.customer.user.full_name ?? null),
      driver: ride.driver
        ? {
            name: ride.driver.user.full_name ?? null,
            avatar_url: ride.driver.avatar_key
              ? `${this.apiBase}/public/track/${token}/driver-avatar?v=${ride.driver.updated_at.getTime()}`
              : null,
          }
        : null,
      vehicle: vehicle
        ? { plate: vehicle.plate_number, make: vehicle.make, model: vehicle.model, color: vehicle.color }
        : null,
      driver_location: tracking.location,
      driver_eta_sec: tracking.eta_sec,
      pickup: { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng), address: ride.pickup_address },
      destination: {
        lat: Number(ride.original_destination_lat),
        lng: Number(ride.original_destination_lng),
        address: ride.original_destination_address,
      },
    };
  }

  async driverAvatar(token: string) {
    const ride = await this.rideFor(token);
    const key = ride.driver?.avatar_key;
    const data = key ? await this.avatars.read(key) : null;
    if (!key || !data) throw new GoException(GoErrorCode.NOT_FOUND, 'Driver photo not found');
    return { data, mime: passportIconMime(key) };
  }

  /** Language for the HTML page when ?lang= is omitted. */
  async pageLanguage(token: string): Promise<TrackingPageLang> {
    if (!TRACKING_TOKEN_FORMAT.test(token)) return 'ar';
    const ride = await this.prisma.goRide.findUnique({
      where: { tracking_token: token },
      select: { customer: { select: { preferred_language: true } } },
    });
    return ride?.customer.preferred_language === GoLanguage.EN ? 'en' : 'ar';
  }

  /** Unknown token → 404; the link stops working (410) once the ride is no longer running. */
  private async rideFor(token: string) {
    if (!TRACKING_TOKEN_FORMAT.test(token)) throw new GoException(GoErrorCode.NOT_FOUND, 'Tracking link not found');
    const ride = await this.prisma.goRide.findUnique({ where: { tracking_token: token }, include: customerRideInclude });
    if (!ride || !ride.share_tracking_link) throw new GoException(GoErrorCode.NOT_FOUND, 'Tracking link not found');
    if (!isTrackableStatus(ride.status)) {
      throw new GoException(GoErrorCode.TRACKING_LINK_EXPIRED, 'This ride has ended');
    }
    return ride;
  }
}
