-- Customer wallet hub: TRANSFER_IN/OUT ledger types + recharge vouchers.

ALTER TYPE "GoWalletTransactionType" ADD VALUE 'TRANSFER_OUT';
ALTER TYPE "GoWalletTransactionType" ADD VALUE 'TRANSFER_IN';

CREATE TYPE "GoWalletVoucherStatus" AS ENUM ('UNUSED', 'REDEEMED', 'EXPIRED', 'DISABLED');

CREATE TABLE "go_wallet_vouchers" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'SYP',
    "status" "GoWalletVoucherStatus" NOT NULL DEFAULT 'UNUSED',
    "expires_at" TIMESTAMP(3),
    "redeemed_by_customer_id" TEXT,
    "redeemed_at" TIMESTAMP(3),
    "redeemed_transaction_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_wallet_vouchers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "go_wallet_vouchers_code_key" ON "go_wallet_vouchers"("code");
CREATE INDEX "go_wallet_vouchers_status_expires_at_idx" ON "go_wallet_vouchers"("status", "expires_at");
CREATE INDEX "go_wallet_vouchers_redeemed_by_customer_id_idx" ON "go_wallet_vouchers"("redeemed_by_customer_id");

ALTER TABLE "go_wallet_vouchers" ADD CONSTRAINT "go_wallet_vouchers_redeemed_by_customer_id_fkey"
  FOREIGN KEY ("redeemed_by_customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "go_wallet_vouchers" ADD CONSTRAINT "go_wallet_vouchers_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "go_customer_wallet_transactions" ADD COLUMN "related_transaction_id" TEXT;

CREATE INDEX "go_customer_wallet_transactions_related_transaction_id_idx"
  ON "go_customer_wallet_transactions"("related_transaction_id");

ALTER TABLE "go_customer_wallet_transactions" ADD CONSTRAINT "go_customer_wallet_transactions_related_transaction_id_fkey"
  FOREIGN KEY ("related_transaction_id") REFERENCES "go_customer_wallet_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
