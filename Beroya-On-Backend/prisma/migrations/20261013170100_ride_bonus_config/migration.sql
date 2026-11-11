-- CreateEnum
CREATE TYPE "GoRideBonusStack" AS ENUM ('MAX', 'SUM');

-- AlterTable
ALTER TABLE "go_incentive_config" ADD COLUMN     "distance_cap" DECIMAL(18,2),
ADD COLUMN     "distance_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "distance_min_km" DECIMAL(6,2) NOT NULL DEFAULT 15,
ADD COLUMN     "distance_pct" DECIMAL(5,2) NOT NULL DEFAULT 10,
ADD COLUMN     "rejection_cap" DECIMAL(18,2),
ADD COLUMN     "rejection_count_expired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rejection_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rejection_min_drivers" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "rejection_pct" DECIMAL(5,2) NOT NULL DEFAULT 15,
ADD COLUMN     "ride_bonus_stack" "GoRideBonusStack" NOT NULL DEFAULT 'MAX';
