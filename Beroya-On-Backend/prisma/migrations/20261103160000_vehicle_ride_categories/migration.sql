-- CreateTable
CREATE TABLE "go_vehicle_ride_categories" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "ride_category_id" TEXT NOT NULL,

    CONSTRAINT "go_vehicle_ride_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_vehicle_ride_categories_ride_category_id_idx" ON "go_vehicle_ride_categories"("ride_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "go_vehicle_ride_categories_vehicle_id_ride_category_id_key" ON "go_vehicle_ride_categories"("vehicle_id", "ride_category_id");

-- AddForeignKey
ALTER TABLE "go_vehicle_ride_categories" ADD CONSTRAINT "go_vehicle_ride_categories_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "go_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_vehicle_ride_categories" ADD CONSTRAINT "go_vehicle_ride_categories_ride_category_id_fkey" FOREIGN KEY ("ride_category_id") REFERENCES "go_ride_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill from legacy singular ride_category_id
INSERT INTO "go_vehicle_ride_categories" ("id", "vehicle_id", "ride_category_id")
SELECT gen_random_uuid()::text, "id", "ride_category_id"
FROM "go_vehicles"
WHERE "ride_category_id" IS NOT NULL;
