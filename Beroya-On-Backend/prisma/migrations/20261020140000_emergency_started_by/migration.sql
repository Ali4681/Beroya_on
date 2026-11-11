-- CreateEnum
CREATE TYPE "GoEmergencyStartedBy" AS ENUM ('CUSTOMER', 'DRIVER');

-- AlterTable
ALTER TABLE "go_emergency_sessions" ADD COLUMN "started_by" "GoEmergencyStartedBy" NOT NULL DEFAULT 'CUSTOMER';
