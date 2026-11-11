-- AlterTable
ALTER TABLE "go_rides" ADD COLUMN "service_code" "GoServiceCode" NOT NULL DEFAULT 'DAILY';
ALTER TABLE "go_rides" ADD COLUMN "passengers_count" INTEGER;
ALTER TABLE "go_rides" ADD COLUMN "vehicles_count" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "go_rides" ADD CONSTRAINT "go_rides_service_code_fkey" FOREIGN KEY ("service_code") REFERENCES "go_services"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "go_rides_service_code_status_idx" ON "go_rides"("service_code", "status");

-- Ticket §29 — TOURIST becomes bookable (estimate/create + multi-vehicle fare).
UPDATE "go_services" SET "is_available" = true WHERE "code" = 'TOURIST';
