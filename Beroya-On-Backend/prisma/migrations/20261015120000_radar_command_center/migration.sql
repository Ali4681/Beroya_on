-- Beroya Radar + Command Center. Additive only: no rows are rewritten or removed.

-- AlterEnum
ALTER TYPE "GoOperationalAlertType" ADD VALUE 'DRIVER_COVERAGE_LOW';
ALTER TYPE "GoOperationalAlertType" ADD VALUE 'ASSIGNMENT_DELAYED';
ALTER TYPE "GoOperationalAlertType" ADD VALUE 'RIDE_DELAYED';
ALTER TYPE "GoOperationalAlertType" ADD VALUE 'CANCELLATION_RATE_HIGH';

-- CreateEnum
CREATE TYPE "GoAlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- AlterTable: pickup H3 cell (nullable; older rides are backfilled in batches by the radar tick)
ALTER TABLE "go_rides" ADD COLUMN "pickup_h3" VARCHAR(16);

-- AlterTable: area / branch alerts have no ride
ALTER TABLE "go_operational_alerts" ALTER COLUMN "ride_id" DROP NOT NULL;
ALTER TABLE "go_operational_alerts" ADD COLUMN "severity" "GoAlertSeverity" NOT NULL DEFAULT 'WARNING';
ALTER TABLE "go_operational_alerts" ADD COLUMN "h3_cell" VARCHAR(16);
ALTER TABLE "go_operational_alerts" ADD COLUMN "measured_value" DECIMAL(12,2);
ALTER TABLE "go_operational_alerts" ADD COLUMN "threshold" DECIMAL(12,2);
ALTER TABLE "go_operational_alerts" ADD COLUMN "dedupe_key" VARCHAR(160);

-- CreateTable
CREATE TABLE "go_command_center_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "coverage_min_unassigned" INTEGER NOT NULL DEFAULT 3,
    "assignment_delay_seconds" INTEGER NOT NULL DEFAULT 180,
    "ride_delay_factor" DECIMAL(4,2) NOT NULL DEFAULT 1.5,
    "ride_delay_min_extra_seconds" INTEGER NOT NULL DEFAULT 600,
    "cancellation_rate_pct" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "cancellation_window_minutes" INTEGER NOT NULL DEFAULT 60,
    "cancellation_min_rides" INTEGER NOT NULL DEFAULT 10,
    "dedupe_minutes" INTEGER NOT NULL DEFAULT 30,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_command_center_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_rides_pickup_h3_created_at_idx" ON "go_rides"("pickup_h3", "created_at");
CREATE INDEX "go_rides_branch_id_created_at_idx" ON "go_rides"("branch_id", "created_at");
CREATE INDEX "go_operational_alerts_dedupe_key_created_at_idx" ON "go_operational_alerts"("dedupe_key", "created_at");
