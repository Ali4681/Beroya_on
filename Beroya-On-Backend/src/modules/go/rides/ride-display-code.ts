/**
 * Short driver-app code for UI (`#TRP-4589`).
 * Derived from `public_number` (e.g. GO-20261020-04589 → TRP-4589) — does not change the stored value.
 */
export function rideDisplayCode(publicNumber: string | null | undefined): string {
  const raw = (publicNumber ?? '').trim();
  const digits = raw.match(/(\d+)$/)?.[1] ?? raw.replace(/\D/g, '');
  const short = (digits.slice(-4) || '0000').padStart(4, '0');
  return `TRP-${short}`;
}
