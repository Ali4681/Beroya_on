-- Staff can grant a one-off bonus to a specific driver from the desk.

ALTER TYPE "GoIncentiveKind" ADD VALUE IF NOT EXISTS 'MANUAL';
