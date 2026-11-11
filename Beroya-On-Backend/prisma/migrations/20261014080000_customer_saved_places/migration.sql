-- CreateEnum
CREATE TYPE "GoSavedPlaceKind" AS ENUM ('HOME', 'WORK', 'OTHER');

-- CreateTable
CREATE TABLE "go_customer_saved_places" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "name_key" VARCHAR(60) NOT NULL,
    "kind" "GoSavedPlaceKind" NOT NULL DEFAULT 'OTHER',
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "address" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_customer_saved_places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_customer_saved_places_customer_id_name_key_key" ON "go_customer_saved_places"("customer_id", "name_key");

-- CreateIndex
CREATE INDEX "go_customer_saved_places_customer_id_updated_at_idx" ON "go_customer_saved_places"("customer_id", "updated_at");

-- One HOME and one WORK per customer (multiple OTHER allowed)
CREATE UNIQUE INDEX "go_customer_saved_places_customer_home_work_key"
ON "go_customer_saved_places"("customer_id", "kind")
WHERE "kind" IN ('HOME', 'WORK');

-- AddForeignKey
ALTER TABLE "go_customer_saved_places" ADD CONSTRAINT "go_customer_saved_places_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
