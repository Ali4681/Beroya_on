-- AlterTable: driver birthday for notification filters + dashboard
ALTER TABLE "go_driver_profiles" ADD COLUMN "date_of_birth" DATE;

-- AlterTable: store segment used for a broadcast
ALTER TABLE "go_notification_broadcasts" ADD COLUMN "filter" VARCHAR(40);
ALTER TABLE "go_notification_broadcasts" ADD COLUMN "audience_limit" INTEGER;

-- Birthday look-ups (month/day)
CREATE INDEX "go_customer_profiles_date_of_birth_idx" ON "go_customer_profiles"("date_of_birth");
CREATE INDEX "go_driver_profiles_date_of_birth_idx" ON "go_driver_profiles"("date_of_birth");
