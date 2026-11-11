-- CreateEnum
CREATE TYPE "GoLanguage" AS ENUM ('AR', 'EN');

-- AlterTable
ALTER TABLE "go_driver_profiles" ADD COLUMN "languages" "GoLanguage"[] DEFAULT ARRAY['AR']::"GoLanguage"[];

-- AlterTable
ALTER TABLE "go_rides" ADD COLUMN "preferred_driver_language" "GoLanguage" NOT NULL DEFAULT 'AR';
