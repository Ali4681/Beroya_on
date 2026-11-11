-- AlterTable
ALTER TABLE "go_rides" ADD COLUMN "rental_ends_at" TIMESTAMP(3);

-- Ticket RENTAL — chauffeur hire becomes bookable + listed on customer home.
UPDATE "go_services" SET "is_available" = true, "is_visible" = true WHERE "code" = 'RENTAL';
