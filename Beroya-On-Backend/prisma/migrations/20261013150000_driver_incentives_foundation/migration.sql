-- CreateEnum
CREATE TYPE "GoIncentiveKind" AS ENUM ('STREAK_DAILY', 'GOAL_CAMPAIGN', 'RIDE_REJECTION', 'RIDE_DISTANCE');

-- AlterEnum
ALTER TYPE "GoWalletTransactionType" ADD VALUE 'INCENTIVE_BONUS';

-- AlterTable
ALTER TABLE "go_rides" ADD COLUMN     "incentive_percentage" DECIMAL(5,2),
ADD COLUMN     "incentive_reason" VARCHAR(40),
ADD COLUMN     "pricing_snapshot" JSONB;

-- CreateTable
CREATE TABLE "go_incentive_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Damascus',
    "min_counted_distance_m" INTEGER NOT NULL DEFAULT 1000,
    "daily_total_cap" DECIMAL(18,2),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_incentive_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_driver_incentive_grants" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "kind" "GoIncentiveKind" NOT NULL,
    "ride_id" TEXT,
    "campaign_id" TEXT,
    "period_key" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "wallet_transaction_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_driver_incentive_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_driver_incentive_grants_wallet_transaction_id_key" ON "go_driver_incentive_grants"("wallet_transaction_id");

-- CreateIndex
CREATE INDEX "go_driver_incentive_grants_created_at_idx" ON "go_driver_incentive_grants"("created_at");

-- CreateIndex
CREATE INDEX "go_driver_incentive_grants_kind_created_at_idx" ON "go_driver_incentive_grants"("kind", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "go_driver_incentive_grants_driver_id_kind_period_key_key" ON "go_driver_incentive_grants"("driver_id", "kind", "period_key");

-- AddForeignKey
ALTER TABLE "go_driver_incentive_grants" ADD CONSTRAINT "go_driver_incentive_grants_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_incentive_grants" ADD CONSTRAINT "go_driver_incentive_grants_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_incentive_grants" ADD CONSTRAINT "go_driver_incentive_grants_wallet_transaction_id_fkey" FOREIGN KEY ("wallet_transaction_id") REFERENCES "go_driver_wallet_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
