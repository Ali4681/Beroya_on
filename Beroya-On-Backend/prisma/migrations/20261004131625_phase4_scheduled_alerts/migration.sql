-- CreateEnum
CREATE TYPE "GoOperationalAlertType" AS ENUM ('LONG_STOP', 'LOCATION_STALE', 'MAJOR_ROUTE_DEVIATION', 'SCHEDULED_DRIVER_OFFLINE', 'SCHEDULED_DRIVER_DELAY', 'URGENT_COMPLAINT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "GoOperationalAlertStatus" AS ENUM ('OPEN', 'CLAIMED', 'RESOLVED');

-- CreateTable
CREATE TABLE "go_operational_alerts" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "type" "GoOperationalAlertType" NOT NULL,
    "status" "GoOperationalAlertStatus" NOT NULL DEFAULT 'OPEN',
    "occurrence_no" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "claimed_by_id" TEXT,
    "claimed_at" TIMESTAMP(3),
    "auto_resolved" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_operational_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_operational_alerts_status_type_idx" ON "go_operational_alerts"("status", "type");

-- CreateIndex
CREATE INDEX "go_operational_alerts_ride_id_type_status_idx" ON "go_operational_alerts"("ride_id", "type", "status");

-- CreateIndex
CREATE INDEX "go_operational_alerts_branch_id_status_idx" ON "go_operational_alerts"("branch_id", "status");

-- CreateIndex
CREATE INDEX "go_rides_type_scheduled_at_idx" ON "go_rides"("type", "scheduled_at");

-- AddForeignKey
ALTER TABLE "go_operational_alerts" ADD CONSTRAINT "go_operational_alerts_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_operational_alerts" ADD CONSTRAINT "go_operational_alerts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_operational_alerts" ADD CONSTRAINT "go_operational_alerts_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
