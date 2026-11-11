-- Passport level stamp duration (days and/or hours). 0+0 = no expiry.
ALTER TABLE "go_customer_passport_levels" ADD COLUMN "duration_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "go_customer_passport_levels" ADD COLUMN "duration_hours" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "go_customer_passport_stamps" ADD COLUMN "expires_at" TIMESTAMP(3);

CREATE INDEX "go_customer_passport_stamps_customer_id_expires_at_idx"
  ON "go_customer_passport_stamps"("customer_id", "expires_at");