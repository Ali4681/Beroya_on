-- Car photos on driver onboarding (2–6 images per driver).
CREATE TABLE "go_driver_vehicle_photos" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "image_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_driver_vehicle_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "go_driver_vehicle_photos_driver_id_sort_order_idx"
  ON "go_driver_vehicle_photos"("driver_id", "sort_order");

ALTER TABLE "go_driver_vehicle_photos"
  ADD CONSTRAINT "go_driver_vehicle_photos_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
