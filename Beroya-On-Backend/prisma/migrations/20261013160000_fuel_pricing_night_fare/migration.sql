-- CreateEnum
CREATE TYPE "GoPerKmMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "go_incentive_config" ADD COLUMN     "night_category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "night_end" VARCHAR(5) NOT NULL DEFAULT '07:00',
ADD COLUMN     "night_fare_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "night_fare_pct" DECIMAL(5,2) NOT NULL DEFAULT 20,
ADD COLUMN     "night_start" VARCHAR(5) NOT NULL DEFAULT '00:00';

-- AlterTable
ALTER TABLE "go_ride_pricing" ADD COLUMN     "per_km_mode" "GoPerKmMode" NOT NULL DEFAULT 'AUTO';

-- CreateTable
CREATE TABLE "go_fuel_pricing" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "current_price" DECIMAL(18,2),
    "fuel_share_pct" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "rounding_step" DECIMAL(18,2) NOT NULL DEFAULT 50,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_fuel_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_fuel_price_changes" (
    "id" TEXT NOT NULL,
    "old_price" DECIMAL(18,2),
    "new_price" DECIMAL(18,2) NOT NULL,
    "fuel_share_pct" DECIMAL(5,2) NOT NULL,
    "rounding_step" DECIMAL(18,2) NOT NULL,
    "changed_by_id" TEXT,
    "affected" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_fuel_price_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_fuel_price_changes_created_at_idx" ON "go_fuel_price_changes"("created_at");

-- AddForeignKey
ALTER TABLE "go_fuel_price_changes" ADD CONSTRAINT "go_fuel_price_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
