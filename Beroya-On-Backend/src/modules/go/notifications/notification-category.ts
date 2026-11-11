/**
 * Fixed visual category for driver inbox icons (home «الإشعارات»).
 * Derived from `event` at read/emit time — not stored in DB.
 */
export const NOTIFICATION_CATEGORIES = ['WALLET', 'RIDE', 'RATING', 'WARNING', 'SYSTEM'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Explicit overrides before prefix heuristics. */
const BY_EVENT: Record<string, NotificationCategory> = {
  'notification.message': 'SYSTEM',
  'support.updated': 'SYSTEM',
  'driver.forced_offline': 'WARNING',
  'wallet.low_balance': 'WARNING',
  'eligibility.updated': 'WARNING',
  'scheduled_ride.attention_required': 'WARNING',
  'ride_offer.expired': 'WARNING',
  'ride.interrupted': 'WARNING',
  'ride.customer_cancelled': 'WARNING',
  'ride.staff_cancelled': 'WARNING',
};

/**
 * Map a socket/inbox event name → UI icon category.
 * Unknown events fall back to SYSTEM (default car/info icon).
 */
export function notificationCategory(event: string): NotificationCategory {
  const exact = BY_EVENT[event];
  if (exact) return exact;

  if (event.startsWith('rating.') || event.includes('rating') || event.endsWith('.rated')) {
    return 'RATING';
  }
  if (event.startsWith('wallet.') || event.startsWith('incentive.')) {
    return 'WALLET';
  }
  if (
    event.startsWith('ride.') ||
    event.startsWith('ride_offer.') ||
    event.startsWith('scheduled_ride.')
  ) {
    return 'RIDE';
  }
  if (event.startsWith('driver.') && event !== 'driver.forced_offline') {
    // e.g. driver_passport.updated — informational
    return 'SYSTEM';
  }
  return 'SYSTEM';
}
