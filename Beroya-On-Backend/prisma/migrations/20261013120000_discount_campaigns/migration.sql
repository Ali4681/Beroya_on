-- AlterTable
ALTER TABLE "go_customer_discount_codes" ADD COLUMN     "max_customers" INTEGER,
ADD COLUMN     "per_customer_limit" INTEGER,
ADD COLUMN     "new_users_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "branch_id" TEXT,
ADD COLUMN     "event_name" VARCHAR(120),
ADD COLUMN     "event_area" JSONB;

-- CreateIndex
CREATE INDEX "go_customer_discount_codes_branch_id_idx" ON "go_customer_discount_codes"("branch_id");

-- AddForeignKey
ALTER TABLE "go_customer_discount_codes" ADD CONSTRAINT "go_customer_discount_codes_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
