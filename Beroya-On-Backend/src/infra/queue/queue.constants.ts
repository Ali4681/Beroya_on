/** Background job queues (Ticket §29). Processors are added by the phase that owns them. */
export const QUEUES = {
  SYSTEM: 'go-system',
  DISPATCH: 'go-dispatch',
  OFFERS: 'go-offers',
  SCHEDULED: 'go-scheduled',
  MONITORING: 'go-monitoring',
  PASSPORT: 'go-passport',
  DISCOUNTS: 'go-discounts',
  EMERGENCY: 'go-emergency',
  NOTIFICATIONS: 'go-notifications',
  INCENTIVES: 'go-incentives',
  RADAR: 'go-radar',
  COMMAND_CENTER: 'go-command-center',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const SYSTEM_JOBS = {
  CLEANUP: 'cleanup',
} as const;

export const DISPATCH_JOBS = {
  SEARCH_TICK: 'search-tick',
  OFFER_TIMEOUT: 'offer-timeout',
} as const;

export type DispatchSearchJob = {
  rideId: string;
  radiusStepIndex?: number;
  batchNumber?: number;
};

export type DispatchOfferTimeoutJob = {
  rideId: string;
  batchNumber: number;
};

export const SCHEDULED_JOBS = {
  REMINDER: 'reminder',
  ONLINE_CHECK: 'online-check',
  ETA_MONITOR: 'eta-monitor',
} as const;

export type ScheduledRideJob = {
  rideId: string;
};

export const MONITORING_JOBS = {
  TICK: 'tick',
} as const;

export const PASSPORT_JOBS = {
  REVIEW_TICK: 'review-tick',
} as const;

export const DISCOUNT_JOBS = {
  EXPIRE_TICK: 'expire-tick',
} as const;

export const INCENTIVE_JOBS = {
  TICK: 'tick',
} as const;

export const RADAR_JOBS = {
  TICK: 'tick',
} as const;

export const COMMAND_CENTER_JOBS = {
  TICK: 'tick',
} as const;

export const EMERGENCY_JOBS = {
  TEMP_CLEANUP: 'temp-cleanup',
} as const;
