-- CreateTable
CREATE TABLE "go_cities" (
    "id" TEXT NOT NULL,
    "name_ar" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(80),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_cities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_cities_name_ar_key" ON "go_cities"("name_ar");

-- CreateIndex
CREATE INDEX "go_cities_is_active_sort_order_idx" ON "go_cities"("is_active", "sort_order");

-- AlterTable
ALTER TABLE "go_customer_profiles" ADD COLUMN "city_id" TEXT;

-- CreateIndex
CREATE INDEX "go_customer_profiles_city_id_idx" ON "go_customer_profiles"("city_id");

-- AddForeignKey
ALTER TABLE "go_customer_profiles" ADD CONSTRAINT "go_customer_profiles_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "go_cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the six app cities (same order as the previous hard-coded Flutter list)
INSERT INTO "go_cities" ("id", "name_ar", "name_en", "sort_order", "is_active", "created_at", "updated_at") VALUES
    (gen_random_uuid()::text, 'حلب', 'Aleppo', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'دمشق', 'Damascus', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'حمص', 'Homs', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'اللاذقية', 'Latakia', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'حماة', 'Hama', 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'طرطوس', 'Tartus', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Backfill city_id when free-text city matches name_ar
UPDATE "go_customer_profiles" p
SET "city_id" = c."id"
FROM "go_cities" c
WHERE p."city" IS NOT NULL AND p."city" = c."name_ar";
