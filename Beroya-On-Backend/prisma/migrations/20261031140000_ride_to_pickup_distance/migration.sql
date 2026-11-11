-- Snapshot of driver → pickup road/air distance (meters) at assignment time.
ALTER TABLE "go_rides" ADD COLUMN IF NOT EXISTS "to_pickup_distance_m" INTEGER;
