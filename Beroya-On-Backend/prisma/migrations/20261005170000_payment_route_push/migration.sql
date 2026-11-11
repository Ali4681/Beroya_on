-- Payment status, fare-stack decision, and device push tokens.

CREATE TYPE "GoPaymentStatus" AS ENUM ('PENDING', 'CASH_EXPECTED', 'COLLECTED', 'WAIVED');
CREATE TYPE "GoFareStackDecision" AS ENUM ('PENDING', 'DISCOUNT_ONLY', 'COMPENSATION_ONLY', 'BOTH');
CREATE TYPE "GoPushDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'SKIPPED', 'FAILED');

ALTER TABLE "go_rides" ADD COLUMN "payment_status" "GoPaymentStatus" NOT NULL DEFAULT 'CASH_EXPECTED';
ALTER TABLE "go_rides" ADD COLUMN "fare_stack_decision" "GoFareStackDecision";

CREATE TABLE "go_push_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "GoDevicePlatform" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_push_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "go_push_tokens_token_key" ON "go_push_tokens"("token");
CREATE INDEX "go_push_tokens_user_id_idx" ON "go_push_tokens"("user_id");

ALTER TABLE "go_push_tokens" ADD CONSTRAINT "go_push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "go_push_deliveries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "status" "GoPushDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_push_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "go_push_deliveries_user_id_created_at_idx" ON "go_push_deliveries"("user_id", "created_at");
