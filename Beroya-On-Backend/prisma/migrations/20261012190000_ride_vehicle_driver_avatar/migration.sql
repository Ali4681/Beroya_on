-- AlterTable
ALTER TABLE "go_driver_profiles" ADD COLUMN     "avatar_key" TEXT;

-- AlterTable
ALTER TABLE "go_rides" ADD COLUMN     "vehicle_id" TEXT,
ADD COLUMN     "vehicle_snapshot" JSONB;

-- AddForeignKey
ALTER TABLE "go_rides" ADD CONSTRAINT "go_rides_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "go_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill rides that are active now from the driver's current vehicle. Finished rides stay null:
-- the vehicle used back then is unknown.
UPDATE "go_rides" r
SET "vehicle_id" = v."id",
    "vehicle_snapshot" = jsonb_build_object(
      'plate_number', v."plate_number",
      'make', v."make",
      'model', v."model",
      'color', v."color",
      'year', v."year"
    )
FROM "go_driver_profiles" d
JOIN "go_vehicles" v ON v."id" = d."active_vehicle_id"
WHERE r."driver_id" = d."id"
  AND r."vehicle_id" IS NULL
  AND r."status" IN ('DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS');
