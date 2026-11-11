-- AlterTable
ALTER TABLE "go_customer_discount_codes" ADD COLUMN "listed" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "go_discount_code_redemptions" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "discount_code_id" TEXT NOT NULL,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_discount_code_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_discount_code_redemptions_customer_id_redeemed_at_idx" ON "go_discount_code_redemptions"("customer_id", "redeemed_at");

-- CreateIndex
CREATE UNIQUE INDEX "go_discount_code_redemptions_customer_id_discount_code_id_key" ON "go_discount_code_redemptions"("customer_id", "discount_code_id");

-- AddForeignKey
ALTER TABLE "go_discount_code_redemptions" ADD CONSTRAINT "go_discount_code_redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_discount_code_redemptions" ADD CONSTRAINT "go_discount_code_redemptions_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "go_customer_discount_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
