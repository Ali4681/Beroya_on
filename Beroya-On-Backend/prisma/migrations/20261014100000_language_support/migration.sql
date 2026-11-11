-- AlterTable
ALTER TABLE "go_customer_profiles" ADD COLUMN "preferred_language" "GoLanguage" NOT NULL DEFAULT 'AR';

-- AlterTable
ALTER TABLE "go_customer_passport_levels" ADD COLUMN "stamp_name_en" VARCHAR(40);

-- AlterTable
ALTER TABLE "go_customer_discount_codes" ADD COLUMN "name_en" TEXT;
