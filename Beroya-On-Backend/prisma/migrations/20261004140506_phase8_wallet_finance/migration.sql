-- CreateEnum
CREATE TYPE "GoWalletTransactionType" AS ENUM ('TOP_UP', 'COMMISSION_DEDUCTION', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "GoCommissionBase" AS ENUM ('GROSS_FINAL_FARE', 'CUSTOMER_PAYABLE');

-- CreateEnum
CREATE TYPE "GoCompensationType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "GoCompensationBearer" AS ENUM ('UNASSIGNED', 'BEROYA', 'DRIVER', 'SPLIT');

-- CreateTable
CREATE TABLE "go_wallet_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "minimum_initial_topup" DECIMAL(18,2) NOT NULL DEFAULT 10000,
    "commission_percentage" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "commission_base" "GoCommissionBase" NOT NULL DEFAULT 'GROSS_FINAL_FARE',
    "system_average_fare" DECIMAL(18,2) NOT NULL DEFAULT 5000,
    "low_balance_amount_enabled" BOOLEAN NOT NULL DEFAULT true,
    "low_balance_amount" DECIMAL(18,2) DEFAULT 20000,
    "low_balance_rides_enabled" BOOLEAN NOT NULL DEFAULT true,
    "low_balance_remaining_rides" INTEGER DEFAULT 3,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_wallet_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_driver_wallets" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "last_commission_amount" DECIMAL(18,2),
    "outstanding_due" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_driver_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_driver_wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "type" "GoWalletTransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balance_before" DECIMAL(18,2) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "ride_id" TEXT,
    "reversed_transaction_id" TEXT,
    "reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_driver_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_wallet_commission_holds" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "reserved_amount" DECIMAL(18,2) NOT NULL,
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_wallet_commission_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_ride_compensations" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "type" "GoCompensationType" NOT NULL,
    "percentage" DECIMAL(5,2),
    "fixed_amount" DECIMAL(18,2),
    "applied_amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "bearer" "GoCompensationBearer" NOT NULL DEFAULT 'UNASSIGNED',
    "beroya_share" DECIMAL(18,2),
    "driver_share" DECIMAL(18,2),
    "finance_reviewed_by_id" TEXT,
    "finance_reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_ride_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_driver_wallets_driver_id_key" ON "go_driver_wallets"("driver_id");

-- CreateIndex
CREATE INDEX "go_driver_wallet_transactions_driver_id_created_at_idx" ON "go_driver_wallet_transactions"("driver_id", "created_at");

-- CreateIndex
CREATE INDEX "go_driver_wallet_transactions_wallet_id_created_at_idx" ON "go_driver_wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "go_wallet_commission_holds_ride_id_key" ON "go_wallet_commission_holds"("ride_id");

-- CreateIndex
CREATE INDEX "go_wallet_commission_holds_driver_id_released_at_idx" ON "go_wallet_commission_holds"("driver_id", "released_at");

-- CreateIndex
CREATE INDEX "go_ride_compensations_ride_id_idx" ON "go_ride_compensations"("ride_id");

-- AddForeignKey
ALTER TABLE "go_driver_wallets" ADD CONSTRAINT "go_driver_wallets_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_wallet_transactions" ADD CONSTRAINT "go_driver_wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "go_driver_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_wallet_transactions" ADD CONSTRAINT "go_driver_wallet_transactions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_wallet_transactions" ADD CONSTRAINT "go_driver_wallet_transactions_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_wallet_transactions" ADD CONSTRAINT "go_driver_wallet_transactions_reversed_transaction_id_fkey" FOREIGN KEY ("reversed_transaction_id") REFERENCES "go_driver_wallet_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_wallet_transactions" ADD CONSTRAINT "go_driver_wallet_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_wallet_commission_holds" ADD CONSTRAINT "go_wallet_commission_holds_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_wallet_commission_holds" ADD CONSTRAINT "go_wallet_commission_holds_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "go_driver_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_wallet_commission_holds" ADD CONSTRAINT "go_wallet_commission_holds_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_compensations" ADD CONSTRAINT "go_ride_compensations_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_compensations" ADD CONSTRAINT "go_ride_compensations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_compensations" ADD CONSTRAINT "go_ride_compensations_finance_reviewed_by_id_fkey" FOREIGN KEY ("finance_reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
