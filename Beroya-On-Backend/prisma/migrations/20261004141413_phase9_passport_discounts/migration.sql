-- CreateEnum
CREATE TYPE "GoPassportScoreEventType" AS ENUM ('RIDE_COMPLETED', 'DRIVER_RATING_1', 'DRIVER_RATING_2', 'DRIVER_RATING_3', 'DRIVER_RATING_4', 'DRIVER_RATING_5', 'LATE_CANCELLATION', 'NO_SHOW', 'CONFIRMED_COMPLAINT', 'STREAK_BONUS');

-- CreateEnum
CREATE TYPE "GoPassportRewardType" AS ENUM ('SCORE', 'DISCOUNT_CODE', 'SCORE_AND_DISCOUNT');

-- CreateEnum
CREATE TYPE "GoPassportRewardGrantStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GoDiscountCodeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "GoRideDiscountReservationStatus" AS ENUM ('RESERVED', 'APPLIED', 'RELEASED');

-- CreateTable
CREATE TABLE "go_customer_passport_levels" (
    "id" TEXT NOT NULL,
    "level_order" INTEGER NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "icon_storage_key" TEXT,
    "minimum_score" INTEGER NOT NULL,
    "minimum_completed_rides" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_customer_passport_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_customer_passport_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "initial_score" INTEGER NOT NULL DEFAULT 100,
    "minimum_score" INTEGER NOT NULL DEFAULT -100,
    "maximum_score" INTEGER NOT NULL DEFAULT 1000,
    "review_interval_minutes" INTEGER NOT NULL DEFAULT 1440,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_customer_passport_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_customer_passports" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "hidden_score" INTEGER NOT NULL,
    "current_level_id" TEXT NOT NULL,
    "completed_rides" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_customer_passports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_passport_score_rules" (
    "id" TEXT NOT NULL,
    "event_type" "GoPassportScoreEventType" NOT NULL,
    "ride_category_id" TEXT,
    "score_delta" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_passport_score_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_passport_score_ledger" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "event_type" "GoPassportScoreEventType" NOT NULL,
    "ride_id" TEXT,
    "delta" INTEGER NOT NULL,
    "score_before" INTEGER NOT NULL,
    "score_after" INTEGER NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_passport_score_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_passport_streak_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "milestone_every_rides" INTEGER NOT NULL DEFAULT 10,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_passport_streak_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_passport_milestone_reward_configs" (
    "id" TEXT NOT NULL,
    "milestone_multiple" INTEGER NOT NULL,
    "reward_type" "GoPassportRewardType" NOT NULL,
    "score_bonus" INTEGER,
    "discount_percentage" DECIMAL(5,2),
    "requires_admin_approval" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "go_passport_milestone_reward_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_passport_reward_grants" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "streak_value" INTEGER NOT NULL,
    "reward_type" "GoPassportRewardType" NOT NULL,
    "status" "GoPassportRewardGrantStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_passport_reward_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_customer_discount_codes" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "maximum_discount_amount" DECIMAL(18,2),
    "valid_from" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "usage_limit" INTEGER NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "immediate_allowed" BOOLEAN NOT NULL DEFAULT true,
    "scheduled_allowed" BOOLEAN NOT NULL DEFAULT true,
    "status" "GoDiscountCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "milestone_grant_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_customer_discount_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_customer_discount_categories" (
    "id" TEXT NOT NULL,
    "discount_code_id" TEXT NOT NULL,
    "ride_category_id" TEXT NOT NULL,

    CONSTRAINT "go_customer_discount_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_ride_discount_reservations" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "discount_code_id" TEXT NOT NULL,
    "status" "GoRideDiscountReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),

    CONSTRAINT "go_ride_discount_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_customer_passport_levels_level_order_key" ON "go_customer_passport_levels"("level_order");

-- CreateIndex
CREATE UNIQUE INDEX "go_customer_passports_customer_id_key" ON "go_customer_passports"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "go_passport_score_rules_event_type_ride_category_id_key" ON "go_passport_score_rules"("event_type", "ride_category_id");

-- CreateIndex
CREATE INDEX "go_passport_score_ledger_customer_id_created_at_idx" ON "go_passport_score_ledger"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "go_passport_score_ledger_ride_id_event_type_idx" ON "go_passport_score_ledger"("ride_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "go_passport_milestone_reward_configs_milestone_multiple_key" ON "go_passport_milestone_reward_configs"("milestone_multiple");

-- CreateIndex
CREATE INDEX "go_passport_reward_grants_status_created_at_idx" ON "go_passport_reward_grants"("status", "created_at");

-- CreateIndex
CREATE INDEX "go_passport_reward_grants_customer_id_idx" ON "go_passport_reward_grants"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "go_customer_discount_codes_code_key" ON "go_customer_discount_codes"("code");

-- CreateIndex
CREATE INDEX "go_customer_discount_codes_customer_id_status_idx" ON "go_customer_discount_codes"("customer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "go_customer_discount_categories_discount_code_id_ride_categ_key" ON "go_customer_discount_categories"("discount_code_id", "ride_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "go_ride_discount_reservations_ride_id_key" ON "go_ride_discount_reservations"("ride_id");

-- AddForeignKey
ALTER TABLE "go_customer_passports" ADD CONSTRAINT "go_customer_passports_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_customer_passports" ADD CONSTRAINT "go_customer_passports_current_level_id_fkey" FOREIGN KEY ("current_level_id") REFERENCES "go_customer_passport_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_passport_score_rules" ADD CONSTRAINT "go_passport_score_rules_ride_category_id_fkey" FOREIGN KEY ("ride_category_id") REFERENCES "go_ride_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_passport_score_ledger" ADD CONSTRAINT "go_passport_score_ledger_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_passport_score_ledger" ADD CONSTRAINT "go_passport_score_ledger_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_passport_reward_grants" ADD CONSTRAINT "go_passport_reward_grants_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_passport_reward_grants" ADD CONSTRAINT "go_passport_reward_grants_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_customer_discount_codes" ADD CONSTRAINT "go_customer_discount_codes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_customer_discount_codes" ADD CONSTRAINT "go_customer_discount_codes_milestone_grant_id_fkey" FOREIGN KEY ("milestone_grant_id") REFERENCES "go_passport_reward_grants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_customer_discount_codes" ADD CONSTRAINT "go_customer_discount_codes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_customer_discount_categories" ADD CONSTRAINT "go_customer_discount_categories_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "go_customer_discount_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_customer_discount_categories" ADD CONSTRAINT "go_customer_discount_categories_ride_category_id_fkey" FOREIGN KEY ("ride_category_id") REFERENCES "go_ride_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_discount_reservations" ADD CONSTRAINT "go_ride_discount_reservations_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_discount_reservations" ADD CONSTRAINT "go_ride_discount_reservations_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "go_customer_discount_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
