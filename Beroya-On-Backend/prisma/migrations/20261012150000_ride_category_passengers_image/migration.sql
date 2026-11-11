-- AlterTable
ALTER TABLE "go_ride_categories" ADD COLUMN "max_passengers" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN "image_key" TEXT;

-- Match the values the customer app shipped with.
UPDATE "go_ride_categories" SET "max_passengers" = 6 WHERE "code" = 'FAMILY';
UPDATE "go_ride_categories" SET "max_passengers" = 7 WHERE "code" = 'XL';
