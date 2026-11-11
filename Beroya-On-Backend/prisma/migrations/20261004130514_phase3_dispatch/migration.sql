-- CreateEnum
CREATE TYPE "GoRideOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'TAKEN_BY_OTHER');

-- CreateTable
CREATE TABLE "go_ride_offers" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "batch_number" INTEGER NOT NULL,
    "radius_m" INTEGER NOT NULL,
    "status" "GoRideOfferStatus" NOT NULL DEFAULT 'PENDING',
    "offered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "effective_eta_sec" INTEGER,

    CONSTRAINT "go_ride_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_ride_offers_ride_id_status_idx" ON "go_ride_offers"("ride_id", "status");

-- CreateIndex
CREATE INDEX "go_ride_offers_driver_id_status_idx" ON "go_ride_offers"("driver_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "go_ride_offers_ride_id_driver_id_key" ON "go_ride_offers"("ride_id", "driver_id");

-- CreateIndex
CREATE INDEX "go_driver_states_h3_index_idx" ON "go_driver_states"("h3_index");

-- CreateIndex
CREATE INDEX "go_driver_states_availability_h3_index_idx" ON "go_driver_states"("availability", "h3_index");

-- AddForeignKey
ALTER TABLE "go_ride_offers" ADD CONSTRAINT "go_ride_offers_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_offers" ADD CONSTRAINT "go_ride_offers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
