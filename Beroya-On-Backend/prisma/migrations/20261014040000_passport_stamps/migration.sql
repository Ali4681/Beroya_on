-- CreateTable
CREATE TABLE "go_customer_passport_stamps" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "level_id" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_customer_passport_stamps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_customer_passport_stamps_customer_id_earned_at_idx" ON "go_customer_passport_stamps"("customer_id", "earned_at");

-- CreateIndex
CREATE UNIQUE INDEX "go_customer_passport_stamps_customer_id_level_id_key" ON "go_customer_passport_stamps"("customer_id", "level_id");

-- AddForeignKey
ALTER TABLE "go_customer_passport_stamps" ADD CONSTRAINT "go_customer_passport_stamps_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_customer_passport_stamps" ADD CONSTRAINT "go_customer_passport_stamps_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "go_customer_passport_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one stamp per active level at or below the customer's current level.
INSERT INTO "go_customer_passport_stamps" ("id", "customer_id", "level_id", "earned_at")
SELECT gen_random_uuid()::text, p."customer_id", l."id", p."created_at"
FROM "go_customer_passports" p
JOIN "go_customer_passport_levels" cur ON cur."id" = p."current_level_id"
JOIN "go_customer_passport_levels" l ON l."level_order" <= cur."level_order" AND l."is_active" = true;
