-- CreateTable
CREATE TABLE "go_driver_passport_levels" (
    "id" TEXT NOT NULL,
    "level_order" INTEGER NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "icon_storage_key" TEXT,
    "minimum_score" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_driver_passport_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_driver_passports" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "hidden_score" INTEGER NOT NULL DEFAULT 0,
    "current_level_id" TEXT,
    "completed_rides" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_driver_passports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_driver_passport_levels_level_order_key" ON "go_driver_passport_levels"("level_order");

-- CreateIndex
CREATE UNIQUE INDEX "go_driver_passports_driver_id_key" ON "go_driver_passports"("driver_id");

-- AddForeignKey
ALTER TABLE "go_driver_passports" ADD CONSTRAINT "go_driver_passports_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_passports" ADD CONSTRAINT "go_driver_passports_current_level_id_fkey" FOREIGN KEY ("current_level_id") REFERENCES "go_driver_passport_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
