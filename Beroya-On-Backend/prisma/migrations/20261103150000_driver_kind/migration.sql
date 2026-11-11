-- CreateEnum
CREATE TYPE "GoDriverKind" AS ENUM ('EXTERNAL', 'BEROYA');

-- AlterTable
ALTER TABLE "go_driver_profiles" ADD COLUMN "kind" "GoDriverKind" NOT NULL DEFAULT 'EXTERNAL';
