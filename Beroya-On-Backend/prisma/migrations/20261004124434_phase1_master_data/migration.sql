-- CreateEnum
CREATE TYPE "GoRideRequirementType" AS ENUM ('FEMALE_DRIVER', 'CHILD_SEAT', 'EXTRA_LUGGAGE', 'ACCESSIBILITY');

-- CreateEnum
CREATE TYPE "GoDriverGender" AS ENUM ('MALE', 'FEMALE', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "GoDocumentType" AS ENUM ('LICENSE', 'VEHICLE_REGISTRATION', 'INSURANCE', 'IDENTITY');

-- AlterTable
ALTER TABLE "go_branches" ADD COLUMN     "service_area" JSONB;

-- CreateTable
CREATE TABLE "go_ride_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_ride_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_ride_pricing" (
    "id" TEXT NOT NULL,
    "ride_category_id" TEXT NOT NULL,
    "base_fare" DECIMAL(18,2) NOT NULL,
    "price_per_km" DECIMAL(18,2) NOT NULL,
    "price_per_minute" DECIMAL(18,2) NOT NULL,
    "minimum_fare" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SYP',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_ride_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_customer_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_driver_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "gender" "GoDriverGender" NOT NULL DEFAULT 'UNSPECIFIED',
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspended_reason" TEXT,
    "operational_blocked" BOOLEAN NOT NULL DEFAULT false,
    "operational_reason" TEXT,
    "active_vehicle_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_driver_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_driver_documents" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "type" "GoDocumentType" NOT NULL,
    "expires_at" TIMESTAMP(3),
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_driver_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_vehicles" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT,
    "driver_id" TEXT,
    "ride_category_id" TEXT,
    "plate_number" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "color" TEXT,
    "year" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_vehicle_capabilities" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "type" "GoRideRequirementType" NOT NULL,

    CONSTRAINT "go_vehicle_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_dispatch_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "batch_size" INTEGER NOT NULL DEFAULT 3,
    "batch_timeout_seconds" INTEGER NOT NULL DEFAULT 10,
    "max_search_radius_m" INTEGER NOT NULL DEFAULT 5000,
    "radius_steps_json" JSONB NOT NULL,
    "busy_driver_max_eta_sec" INTEGER NOT NULL DEFAULT 300,
    "scheduled_busy_to_pickup_max_eta_sec" INTEGER NOT NULL DEFAULT 180,
    "scheduled_required_early_arrival_sec" INTEGER NOT NULL DEFAULT 120,
    "pickup_arrival_radius_m" INTEGER NOT NULL DEFAULT 10,
    "stale_location_seconds" INTEGER NOT NULL DEFAULT 60,
    "long_stop_seconds" INTEGER NOT NULL DEFAULT 600,
    "scheduled_reminder_seconds" INTEGER NOT NULL DEFAULT 3600,
    "scheduled_online_required_seconds" INTEGER NOT NULL DEFAULT 1800,
    "scheduled_late_tolerance_seconds" INTEGER NOT NULL DEFAULT 300,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_dispatch_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_ride_categories_code_key" ON "go_ride_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "go_ride_pricing_ride_category_id_key" ON "go_ride_pricing"("ride_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "go_customer_profiles_user_id_key" ON "go_customer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "go_driver_profiles_user_id_key" ON "go_driver_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "go_driver_profiles_active_vehicle_id_key" ON "go_driver_profiles"("active_vehicle_id");

-- CreateIndex
CREATE INDEX "go_driver_profiles_branch_id_idx" ON "go_driver_profiles"("branch_id");

-- CreateIndex
CREATE INDEX "go_driver_documents_driver_id_idx" ON "go_driver_documents"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "go_driver_documents_driver_id_type_key" ON "go_driver_documents"("driver_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "go_vehicles_plate_number_key" ON "go_vehicles"("plate_number");

-- CreateIndex
CREATE INDEX "go_vehicles_driver_id_idx" ON "go_vehicles"("driver_id");

-- CreateIndex
CREATE INDEX "go_vehicles_branch_id_idx" ON "go_vehicles"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "go_vehicle_capabilities_vehicle_id_type_key" ON "go_vehicle_capabilities"("vehicle_id", "type");

-- AddForeignKey
ALTER TABLE "go_ride_pricing" ADD CONSTRAINT "go_ride_pricing_ride_category_id_fkey" FOREIGN KEY ("ride_category_id") REFERENCES "go_ride_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_customer_profiles" ADD CONSTRAINT "go_customer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_profiles" ADD CONSTRAINT "go_driver_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_profiles" ADD CONSTRAINT "go_driver_profiles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_profiles" ADD CONSTRAINT "go_driver_profiles_active_vehicle_id_fkey" FOREIGN KEY ("active_vehicle_id") REFERENCES "go_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_documents" ADD CONSTRAINT "go_driver_documents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_vehicles" ADD CONSTRAINT "go_vehicles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_vehicles" ADD CONSTRAINT "go_vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_vehicles" ADD CONSTRAINT "go_vehicles_ride_category_id_fkey" FOREIGN KEY ("ride_category_id") REFERENCES "go_ride_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_vehicle_capabilities" ADD CONSTRAINT "go_vehicle_capabilities_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "go_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
