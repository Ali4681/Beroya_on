-- Pickup source + amendment timestamp for wrong-pin / GPS distinction (driver ops §14).

ALTER TABLE "go_rides" ADD COLUMN "pickup_source" VARCHAR(32);
ALTER TABLE "go_rides" ADD COLUMN "pickup_updated_at" TIMESTAMP(3);
