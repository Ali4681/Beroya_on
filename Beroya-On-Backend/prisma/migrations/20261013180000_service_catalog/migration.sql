-- CreateEnum
CREATE TYPE "GoServiceCode" AS ENUM ('DAILY', 'RENTAL', 'AIRPORT', 'ACCESSIBILITY', 'INTERCITY', 'TOURIST', 'FLEET');

-- CreateTable
CREATE TABLE "go_services" (
    "code" "GoServiceCode" NOT NULL,
    "name_ar" VARCHAR(60) NOT NULL,
    "name_en" VARCHAR(60),
    "image_key" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT false,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "promotion_label_ar" VARCHAR(40),
    "promotion_expires_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_services_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "go_discount_code_services" (
    "discount_code_id" TEXT NOT NULL,
    "service_code" "GoServiceCode" NOT NULL,

    CONSTRAINT "go_discount_code_services_pkey" PRIMARY KEY ("discount_code_id","service_code")
);

-- AddForeignKey
ALTER TABLE "go_discount_code_services" ADD CONSTRAINT "go_discount_code_services_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "go_customer_discount_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_discount_code_services" ADD CONSTRAINT "go_discount_code_services_service_code_fkey" FOREIGN KEY ("service_code") REFERENCES "go_services"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the catalog; only DAILY rides can be booked today
INSERT INTO "go_services" ("code", "name_ar", "name_en", "is_available", "sort_order", "updated_at") VALUES
    ('DAILY', 'يومي', 'Daily', true, 1, CURRENT_TIMESTAMP),
    ('RENTAL', 'استئجار مع سائق', 'Rental with driver', false, 2, CURRENT_TIMESTAMP),
    ('AIRPORT', 'مطارات', 'Airport', false, 3, CURRENT_TIMESTAMP),
    ('ACCESSIBILITY', 'ذوي الاحتياجات الخاصة', 'Accessibility', false, 4, CURRENT_TIMESTAMP),
    ('INTERCITY', 'بين المحافظات', 'Intercity', false, 5, CURRENT_TIMESTAMP),
    ('TOURIST', 'نقل سياحي', 'Tourist', false, 6, CURRENT_TIMESTAMP),
    ('FLEET', 'أسطول', 'Fleet', false, 7, CURRENT_TIMESTAMP);
