-- AlterTable
ALTER TABLE "go_rides" ADD COLUMN "random_vehicles" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "go_rides" ADD COLUMN "fleet_vehicles" JSONB;

-- Ticket FLEET — bookable + listed on customer home.
UPDATE "go_services" SET "is_available" = true, "is_visible" = true WHERE "code" = 'FLEET';
