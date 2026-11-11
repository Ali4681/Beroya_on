-- AlterTable
ALTER TABLE "go_emergency_sessions" ADD COLUMN     "claimed_at" TIMESTAMP(3),
ADD COLUMN     "last_lat" DECIMAL(10,7),
ADD COLUMN     "last_lng" DECIMAL(10,7),
ADD COLUMN     "last_location_at" TIMESTAMP(3);

-- Sessions already claimed (HANDLED) have no claim time; the last update is the closest record.
UPDATE "go_emergency_sessions" SET "claimed_at" = "updated_at" WHERE "status" = 'HANDLED';

UPDATE "go_emergency_sessions"
SET "last_lat" = "started_lat", "last_lng" = "started_lng", "last_location_at" = "started_at"
WHERE "started_lat" IS NOT NULL AND "started_lng" IS NOT NULL;
