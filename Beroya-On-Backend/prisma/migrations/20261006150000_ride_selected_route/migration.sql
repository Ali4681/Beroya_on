-- AlterTable
ALTER TABLE "go_rides" ADD COLUMN IF NOT EXISTS "estimated_route_polyline" TEXT;
ALTER TABLE "go_rides" ADD COLUMN IF NOT EXISTS "estimated_route_source" TEXT;
ALTER TABLE "go_rides" ADD COLUMN IF NOT EXISTS "estimated_route_summary" TEXT;
