-- CreateEnum
CREATE TYPE "GoRideType" AS ENUM ('IMMEDIATE', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "GoRideStatus" AS ENUM ('SEARCHING', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_CUSTOMER', 'NO_SHOW', 'INTERRUPTED', 'REPLACED', 'FAILED_NO_DRIVER');

-- CreateEnum
CREATE TYPE "GoPaymentMethod" AS ENUM ('CASH', 'SHAM_CASH');

-- CreateEnum
CREATE TYPE "GoBookingFor" AS ENUM ('SELF', 'OTHER');

-- CreateEnum
CREATE TYPE "GoDriverAvailability" AS ENUM ('OFFLINE', 'ONLINE', 'BUSY');

-- CreateTable
CREATE TABLE "go_rides" (
    "id" TEXT NOT NULL,
    "public_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "ride_category_id" TEXT NOT NULL,
    "type" "GoRideType" NOT NULL,
    "status" "GoRideStatus" NOT NULL,
    "payment_method" "GoPaymentMethod" NOT NULL DEFAULT 'CASH',
    "booking_for" "GoBookingFor" NOT NULL DEFAULT 'SELF',
    "other_passenger_name" TEXT,
    "other_passenger_phone" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "pickup_lat" DECIMAL(10,7) NOT NULL,
    "pickup_lng" DECIMAL(10,7) NOT NULL,
    "pickup_address" TEXT,
    "original_destination_lat" DECIMAL(10,7) NOT NULL,
    "original_destination_lng" DECIMAL(10,7) NOT NULL,
    "original_destination_address" TEXT,
    "actual_start_lat" DECIMAL(10,7),
    "actual_start_lng" DECIMAL(10,7),
    "actual_dropoff_lat" DECIMAL(10,7),
    "actual_dropoff_lng" DECIMAL(10,7),
    "estimated_distance_m" INTEGER,
    "estimated_duration_sec" INTEGER,
    "estimated_fare" DECIMAL(18,2),
    "actual_distance_m" INTEGER,
    "actual_duration_sec" INTEGER,
    "billable_waiting_sec" INTEGER NOT NULL DEFAULT 0,
    "gross_final_fare" DECIMAL(18,2),
    "discount_total" DECIMAL(18,2),
    "compensation_total" DECIMAL(18,2),
    "customer_payable" DECIMAL(18,2),
    "assigned_at" TIMESTAMP(3),
    "arrived_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "no_show_at" TIMESTAMP(3),
    "replacement_of_ride_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_ride_stops" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "address" TEXT,
    "arrived_at" TIMESTAMP(3),
    "departed_at" TIMESTAMP(3),
    "waiting_seconds" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_ride_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_ride_requirements" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "type" "GoRideRequirementType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_ride_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_driver_states" (
    "driver_id" TEXT NOT NULL,
    "availability" "GoDriverAvailability" NOT NULL DEFAULT 'OFFLINE',
    "last_lat" DECIMAL(10,7),
    "last_lng" DECIMAL(10,7),
    "h3_index" TEXT,
    "last_location_at" TIMESTAMP(3),
    "current_ride_id" TEXT,
    "next_ride_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_driver_states_pkey" PRIMARY KEY ("driver_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_rides_public_number_key" ON "go_rides"("public_number");

-- CreateIndex
CREATE INDEX "go_rides_customer_id_status_idx" ON "go_rides"("customer_id", "status");

-- CreateIndex
CREATE INDEX "go_rides_driver_id_status_idx" ON "go_rides"("driver_id", "status");

-- CreateIndex
CREATE INDEX "go_rides_branch_id_status_idx" ON "go_rides"("branch_id", "status");

-- CreateIndex
CREATE INDEX "go_rides_status_created_at_idx" ON "go_rides"("status", "created_at");

-- CreateIndex
CREATE INDEX "go_ride_stops_ride_id_idx" ON "go_ride_stops"("ride_id");

-- CreateIndex
CREATE UNIQUE INDEX "go_ride_stops_ride_id_sequence_key" ON "go_ride_stops"("ride_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "go_ride_requirements_ride_id_type_key" ON "go_ride_requirements"("ride_id", "type");

-- AddForeignKey
ALTER TABLE "go_rides" ADD CONSTRAINT "go_rides_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_rides" ADD CONSTRAINT "go_rides_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_rides" ADD CONSTRAINT "go_rides_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_rides" ADD CONSTRAINT "go_rides_ride_category_id_fkey" FOREIGN KEY ("ride_category_id") REFERENCES "go_ride_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_rides" ADD CONSTRAINT "go_rides_replacement_of_ride_id_fkey" FOREIGN KEY ("replacement_of_ride_id") REFERENCES "go_rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_stops" ADD CONSTRAINT "go_ride_stops_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_requirements" ADD CONSTRAINT "go_ride_requirements_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_states" ADD CONSTRAINT "go_driver_states_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
