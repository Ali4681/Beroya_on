-- Driver phone change: OTP verifies ownership; staff approve before User.phone updates.

CREATE TYPE "GoDriverPhoneChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "go_driver_phone_change_requests" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "current_phone" TEXT NOT NULL,
    "requested_phone" TEXT NOT NULL,
    "status" "GoDriverPhoneChangeStatus" NOT NULL DEFAULT 'PENDING',
    "otp_verified_at" TIMESTAMP(3) NOT NULL,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_driver_phone_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "go_driver_phone_change_requests_status_created_at_idx"
  ON "go_driver_phone_change_requests"("status", "created_at");

CREATE INDEX "go_driver_phone_change_requests_driver_id_status_idx"
  ON "go_driver_phone_change_requests"("driver_id", "status");

CREATE INDEX "go_driver_phone_change_requests_branch_id_status_idx"
  ON "go_driver_phone_change_requests"("branch_id", "status");

-- At most one PENDING request per driver.
CREATE UNIQUE INDEX "go_driver_phone_change_one_pending"
  ON "go_driver_phone_change_requests"("driver_id")
  WHERE "status" = 'PENDING';

ALTER TABLE "go_driver_phone_change_requests"
  ADD CONSTRAINT "go_driver_phone_change_requests_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "go_driver_phone_change_requests"
  ADD CONSTRAINT "go_driver_phone_change_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "go_driver_phone_change_requests"
  ADD CONSTRAINT "go_driver_phone_change_requests_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "go_driver_phone_change_requests"
  ADD CONSTRAINT "go_driver_phone_change_requests_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
