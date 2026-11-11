-- CreateTable
CREATE TABLE "go_customer_wallets" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_customer_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_customer_wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "type" "GoWalletTransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balance_before" DECIMAL(18,2) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_customer_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_customer_wallets_customer_id_key" ON "go_customer_wallets"("customer_id");

-- CreateIndex
CREATE INDEX "go_customer_wallet_transactions_customer_id_created_at_idx" ON "go_customer_wallet_transactions"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "go_customer_wallet_transactions_wallet_id_created_at_idx" ON "go_customer_wallet_transactions"("wallet_id", "created_at");

-- AddForeignKey
ALTER TABLE "go_customer_wallets" ADD CONSTRAINT "go_customer_wallets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_customer_wallet_transactions" ADD CONSTRAINT "go_customer_wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "go_customer_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_customer_wallet_transactions" ADD CONSTRAINT "go_customer_wallet_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_customer_wallet_transactions" ADD CONSTRAINT "go_customer_wallet_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
