-- AlterTable
ALTER TABLE "go_branches" ADD COLUMN     "center_lat" DECIMAL(10,7),
ADD COLUMN     "center_lng" DECIMAL(10,7);

-- AlterTable
ALTER TABLE "go_rides" ADD COLUMN     "incentive_distance_pct" DECIMAL(5,2),
ADD COLUMN     "incentive_rejection_pct" DECIMAL(5,2);
