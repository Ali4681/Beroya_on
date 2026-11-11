-- Cancel / compensation policy gaps

CREATE TYPE "GoCancelActorRole" AS ENUM ('CUSTOMER', 'DRIVER', 'STAFF');
CREATE TYPE "GoDriverPassportScoreEventType" AS ENUM ('RIDE_COMPLETED', 'DRIVER_CANCELLED_RIDE');

ALTER TYPE "GoRideStatus" ADD VALUE IF NOT EXISTS 'CANCELLED_BY_DRIVER';
ALTER TYPE "GoRideStatus" ADD VALUE IF NOT EXISTS 'CANCELLED_BY_STAFF';

ALTER TYPE "GoWalletTransactionType" ADD VALUE IF NOT EXISTS 'COMPENSATION_BEARER';
ALTER TYPE "GoWalletTransactionType" ADD VALUE IF NOT EXISTS 'DRIVER_CANCEL_PENALTY';

ALTER TYPE "GoPassportScoreEventType" ADD VALUE IF NOT EXISTS 'EN_ROUTE_CANCELLATION';

ALTER TABLE "go_rides"
  ADD COLUMN IF NOT EXISTS "cancel_actor_role" "GoCancelActorRole",
  ADD COLUMN IF NOT EXISTS "cancel_reason_code" TEXT,
  ADD COLUMN IF NOT EXISTS "cancel_reason_text" TEXT,
  ADD COLUMN IF NOT EXISTS "cancel_score_event" TEXT;

ALTER TABLE "go_wallet_config"
  ADD COLUMN IF NOT EXISTS "driver_cancel_penalty_amount" DECIMAL(18, 2) NOT NULL DEFAULT 2000;

ALTER TABLE "go_ride_compensations"
  ADD COLUMN IF NOT EXISTS "wallet_posted_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "wallet_transaction_id" TEXT;

CREATE TABLE IF NOT EXISTS "go_driver_passport_score_rules" (
  "id" TEXT NOT NULL,
  "event_type" "GoDriverPassportScoreEventType" NOT NULL,
  "score_delta" INTEGER NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "go_driver_passport_score_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "go_driver_passport_score_rules_event_type_key"
  ON "go_driver_passport_score_rules"("event_type");

CREATE TABLE IF NOT EXISTS "go_driver_passport_score_ledger" (
  "id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "passport_id" TEXT NOT NULL,
  "event_type" "GoDriverPassportScoreEventType" NOT NULL,
  "ride_id" TEXT,
  "delta" INTEGER NOT NULL,
  "score_before" INTEGER NOT NULL,
  "score_after" INTEGER NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "go_driver_passport_score_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "go_driver_passport_score_ledger_driver_id_created_at_idx"
  ON "go_driver_passport_score_ledger"("driver_id", "created_at");
CREATE INDEX IF NOT EXISTS "go_driver_passport_score_ledger_ride_id_event_type_idx"
  ON "go_driver_passport_score_ledger"("ride_id", "event_type");

ALTER TABLE "go_driver_passport_score_ledger"
  ADD CONSTRAINT "go_driver_passport_score_ledger_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "go_driver_passport_score_ledger"
  ADD CONSTRAINT "go_driver_passport_score_ledger_passport_id_fkey"
  FOREIGN KEY ("passport_id") REFERENCES "go_driver_passports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "go_driver_passport_score_ledger"
  ADD CONSTRAINT "go_driver_passport_score_ledger_ride_id_fkey"
  FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;
