-- CreateTable
CREATE TABLE "go_packages" (
    "id" TEXT NOT NULL,
    "name_ar" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(80),
    "description_ar" VARCHAR(500),
    "description_en" VARCHAR(500),
    "price" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'SYP',
    "duration_days" INTEGER NOT NULL,
    "ride_count" INTEGER,
    "discount_percentage" DECIMAL(5,2),
    "image_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_packages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "go_packages_benefit_check" CHECK ("ride_count" IS NOT NULL OR "discount_percentage" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "go_packages_is_active_sort_order_idx" ON "go_packages"("is_active", "sort_order");
