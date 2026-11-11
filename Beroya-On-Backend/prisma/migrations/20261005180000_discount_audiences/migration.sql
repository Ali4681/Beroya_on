CREATE TYPE "GoDiscountAudience" AS ENUM ('ALL', 'CUSTOMERS', 'STAMP');

ALTER TABLE "go_customer_discount_codes"
  ADD COLUMN "audience" "GoDiscountAudience" NOT NULL DEFAULT 'CUSTOMERS',
  ADD COLUMN "passport_level_id" TEXT;

ALTER TABLE "go_customer_discount_codes" ALTER COLUMN "customer_id" DROP NOT NULL;

ALTER TABLE "go_customer_discount_codes"
  ADD CONSTRAINT "go_customer_discount_codes_passport_level_id_fkey"
  FOREIGN KEY ("passport_level_id") REFERENCES "go_customer_passport_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "go_customer_discount_codes_audience_passport_level_id_idx"
  ON "go_customer_discount_codes"("audience", "passport_level_id");

CREATE TABLE "go_discount_code_customers" (
  "id" TEXT NOT NULL,
  "discount_code_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  CONSTRAINT "go_discount_code_customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "go_discount_code_customers_discount_code_id_customer_id_key"
  ON "go_discount_code_customers"("discount_code_id", "customer_id");

ALTER TABLE "go_discount_code_customers"
  ADD CONSTRAINT "go_discount_code_customers_discount_code_id_fkey"
  FOREIGN KEY ("discount_code_id") REFERENCES "go_customer_discount_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "go_discount_code_customers"
  ADD CONSTRAINT "go_discount_code_customers_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "go_discount_code_customers" ("id", "discount_code_id", "customer_id")
SELECT gen_random_uuid()::text, "id", "customer_id"
FROM "go_customer_discount_codes"
WHERE "customer_id" IS NOT NULL;
