-- Beroya Stores (POS) + store balances + driver wallet POS recharge.
-- Additive only: no existing row is rewritten or removed.

-- CreateEnum
CREATE TYPE "GoStoreStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "GoStoreLedgerType" AS ENUM ('ADMIN_CREDIT', 'DRIVER_RECHARGE_DEBIT', 'REVERSAL_CREDIT', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "GoLedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- AlterEnum
ALTER TYPE "GoRole" ADD VALUE 'STORE_OPERATOR';

-- AlterEnum
ALTER TYPE "GoWalletTransactionType" ADD VALUE 'POS_RECHARGE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "store_id" TEXT;

-- CreateTable
CREATE TABLE "go_stores" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "owner_name" VARCHAR(120) NOT NULL,
    "mobile_number" VARCHAR(20) NOT NULL,
    "address" VARCHAR(300),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "branch_id" TEXT NOT NULL,
    "status" "GoStoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "status_reason" VARCHAR(300),
    "status_changed_at" TIMESTAMP(3),
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'SYP',
    "low_balance_threshold" DECIMAL(18,2) NOT NULL DEFAULT 100000,
    "max_recharge_amount" DECIMAL(18,2),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_stores_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "go_stores_balance_non_negative" CHECK ("balance" >= 0),
    CONSTRAINT "go_stores_threshold_non_negative" CHECK ("low_balance_threshold" >= 0),
    CONSTRAINT "go_stores_max_recharge_positive" CHECK ("max_recharge_amount" IS NULL OR "max_recharge_amount" > 0)
);

-- CreateTable
CREATE TABLE "go_store_ledger_entries" (
    "id" TEXT NOT NULL,
    "reference" VARCHAR(32) NOT NULL,
    "store_id" TEXT NOT NULL,
    "type" "GoStoreLedgerType" NOT NULL,
    "direction" "GoLedgerDirection" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'SYP',
    "balance_before" DECIMAL(18,2) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "driver_id" TEXT,
    "wallet_transaction_id" TEXT,
    "reversed_entry_id" TEXT,
    "idempotency_key" VARCHAR(128),
    "request_hash" VARCHAR(64),
    "external_reference" VARCHAR(80),
    "note" VARCHAR(500),
    "performed_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_store_ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "go_store_ledger_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "go_store_ledger_balance_after_non_negative" CHECK ("balance_after" >= 0),
    CONSTRAINT "go_store_ledger_arithmetic" CHECK (
        ("direction" = 'CREDIT' AND "balance_after" = "balance_before" + "amount")
        OR ("direction" = 'DEBIT' AND "balance_after" = "balance_before" - "amount")
    ),
    CONSTRAINT "go_store_ledger_type_direction" CHECK (
        ("type" = 'ADMIN_CREDIT' AND "direction" = 'CREDIT')
        OR ("type" = 'DRIVER_RECHARGE_DEBIT' AND "direction" = 'DEBIT' AND "driver_id" IS NOT NULL AND "wallet_transaction_id" IS NOT NULL)
        OR ("type" = 'REVERSAL_CREDIT' AND "direction" = 'CREDIT' AND "reversed_entry_id" IS NOT NULL)
        OR ("type" = 'ADMIN_ADJUSTMENT')
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "go_stores_code_key" ON "go_stores"("code");

-- CreateIndex
CREATE INDEX "go_stores_branch_id_idx" ON "go_stores"("branch_id");

-- CreateIndex
CREATE INDEX "go_stores_status_idx" ON "go_stores"("status");

-- CreateIndex
CREATE INDEX "go_stores_mobile_number_idx" ON "go_stores"("mobile_number");

-- CreateIndex
CREATE INDEX "go_stores_created_at_idx" ON "go_stores"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "go_store_ledger_entries_reference_key" ON "go_store_ledger_entries"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "go_store_ledger_entries_wallet_transaction_id_key" ON "go_store_ledger_entries"("wallet_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "go_store_ledger_entries_reversed_entry_id_key" ON "go_store_ledger_entries"("reversed_entry_id");

-- CreateIndex
CREATE INDEX "go_store_ledger_entries_store_id_created_at_idx" ON "go_store_ledger_entries"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "go_store_ledger_entries_type_created_at_idx" ON "go_store_ledger_entries"("type", "created_at");

-- CreateIndex
CREATE INDEX "go_store_ledger_entries_driver_id_created_at_idx" ON "go_store_ledger_entries"("driver_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "go_store_ledger_entries_store_id_idempotency_key_key" ON "go_store_ledger_entries"("store_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "go_driver_wallet_transactions_type_created_at_idx" ON "go_driver_wallet_transactions"("type", "created_at");

-- CreateIndex
CREATE INDEX "users_store_id_idx" ON "users"("store_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "go_stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_stores" ADD CONSTRAINT "go_stores_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_stores" ADD CONSTRAINT "go_stores_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_store_ledger_entries" ADD CONSTRAINT "go_store_ledger_entries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "go_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_store_ledger_entries" ADD CONSTRAINT "go_store_ledger_entries_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_store_ledger_entries" ADD CONSTRAINT "go_store_ledger_entries_wallet_transaction_id_fkey" FOREIGN KEY ("wallet_transaction_id") REFERENCES "go_driver_wallet_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_store_ledger_entries" ADD CONSTRAINT "go_store_ledger_entries_reversed_entry_id_fkey" FOREIGN KEY ("reversed_entry_id") REFERENCES "go_store_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_store_ledger_entries" ADD CONSTRAINT "go_store_ledger_entries_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial history is append-only: corrections are new rows (REVERSAL_CREDIT / ADMIN_ADJUSTMENT), never edits.
CREATE OR REPLACE FUNCTION go_store_ledger_immutable() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'go_store_ledger_entries is append-only (% rejected)', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER go_store_ledger_entries_immutable
    BEFORE UPDATE OR DELETE ON "go_store_ledger_entries"
    FOR EACH ROW EXECUTE FUNCTION go_store_ledger_immutable();

-- Stores themselves are deactivated (SUSPENDED), never deleted, once they have history.
CREATE OR REPLACE FUNCTION go_stores_no_delete() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'go_stores rows are suspended, not deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER go_stores_no_delete
    BEFORE DELETE ON "go_stores"
    FOR EACH ROW EXECUTE FUNCTION go_stores_no_delete();
