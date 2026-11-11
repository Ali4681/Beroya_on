import type { Locale } from "@/core/i18n/config";

export type TrackableStatus =
  | "SEARCHING"
  | "DRIVER_ASSIGNED"
  | "DRIVER_EN_ROUTE"
  | "ARRIVED"
  | "IN_PROGRESS";

type TrackingCopy = {
  title: string;
  header: string;
  loading: string;
  etaPrefix: string;
  etaUnit: string;
  driverFallback: string;
  vehicleLabel: string;
  locationLabel: string;
  openInMaps: string;
  locationUnavailable: string;
  ended: string;
  invalid: string;
  status: Record<TrackableStatus, string>;
};

export const trackingCopy: Record<Locale, TrackingCopy> = {
  ar: {
    title: "تتبع الرحلة",
    header: "تتبع الرحلة",
    loading: "جارٍ التحميل…",
    etaPrefix: "الوقت المتوقع: ",
    etaUnit: " دقيقة",
    driverFallback: "السائق",
    vehicleLabel: "المركبة",
    locationLabel: "موقع السائق الحالي",
    openInMaps: "افتح في الخرائط",
    locationUnavailable: "الموقع غير متاح حالياً",
    ended: "انتهت هذه الرحلة ولم يعد الرابط فعّالاً.",
    invalid: "رابط التتبع غير صالح.",
    status: {
      SEARCHING: "جارٍ البحث عن سائق",
      DRIVER_ASSIGNED: "تم تعيين السائق",
      DRIVER_EN_ROUTE: "السائق في الطريق إليك",
      ARRIVED: "السائق وصل إلى نقطة الالتقاء",
      IN_PROGRESS: "الرحلة جارية",
    },
  },
  en: {
    title: "Track trip",
    header: "Track trip",
    loading: "Loading…",
    etaPrefix: "ETA: ",
    etaUnit: " min",
    driverFallback: "Driver",
    vehicleLabel: "Vehicle",
    locationLabel: "Driver location",
    openInMaps: "Open in Maps",
    locationUnavailable: "Location unavailable",
    ended: "This trip has ended and the link is no longer active.",
    invalid: "This tracking link is invalid.",
    status: {
      SEARCHING: "Looking for a driver",
      DRIVER_ASSIGNED: "Driver assigned",
      DRIVER_EN_ROUTE: "Driver is on the way",
      ARRIVED: "Driver arrived at pickup",
      IN_PROGRESS: "Trip in progress",
    },
  },
};

export function statusLabel(copy: TrackingCopy, status: string) {
  return copy.status[status as TrackableStatus] ?? status;
}
