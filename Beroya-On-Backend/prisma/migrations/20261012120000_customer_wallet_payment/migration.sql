-- AlterEnum
ALTER TYPE "GoPaymentMethod" ADD VALUE 'WALLET';

-- AlterEnum
ALTER TYPE "GoWalletTransactionType" ADD VALUE 'RIDE_PAYMENT';
ALTER TYPE "GoWalletTransactionType" ADD VALUE 'RIDE_REFUND';

-- AlterTable
ALTER TABLE "go_customer_wallet_transactions" ADD COLUMN "ride_id" TEXT;

-- AlterTable
ALTER TABLE "go_rides" ADD COLUMN "wallet_paid_amount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "go_customer_wallet_transactions_ride_id_idx" ON "go_customer_wallet_transactions"("ride_id");

-- AddForeignKey
ALTER TABLE "go_customer_wallet_transactions" ADD CONSTRAINT "go_customer_wallet_transactions_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;
