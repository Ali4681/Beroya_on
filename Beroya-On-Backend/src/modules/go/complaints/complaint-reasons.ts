/** Reason codes the customer app may send (also listed in GET /meta/enums). */
export const COMPLAINT_REASON_CODES = [
  'DANGEROUS_DRIVING',
  'DRIVER_BEHAVIOR',
  'ROUTE_ISSUE',
  'FARE_ISSUE',
  'VEHICLE_ISSUE',
  'LATE_DRIVER',
  'OTHER',
] as const;

export type ComplaintReasonCode = (typeof COMPLAINT_REASON_CODES)[number];

/** Reasons that force URGENT priority (Ticket §14.2). */
export const URGENT_REASON_CODES: ReadonlySet<string> = new Set<ComplaintReasonCode>(['DANGEROUS_DRIVING']);

/** Complaints are accepted on COMPLETED rides for this long after completion. */
export const COMPLAINT_WINDOW_SEC = 7 * 24 * 60 * 60;
