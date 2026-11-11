-- AlterTable
ALTER TABLE "go_incentive_config" ADD COLUMN     "daily_close_time" VARCHAR(5) NOT NULL DEFAULT '00:00',
ADD COLUMN     "streak_amount" DECIMAL(18,2) NOT NULL DEFAULT 25000,
ADD COLUMN     "streak_count_expired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "streak_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "streak_rides" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "go_goal_campaigns" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "days_of_week" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "rides_required" INTEGER NOT NULL,
    "reward_amount" DECIMAL(18,2) NOT NULL,
    "branch_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_goal_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_incentive_runs" (
    "id" TEXT NOT NULL,
    "kind" "GoIncentiveKind" NOT NULL,
    "period_key" VARCHAR(80) NOT NULL,
    "notified_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "stats" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_incentive_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_goal_campaigns_is_active_idx" ON "go_goal_campaigns"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "go_incentive_runs_kind_period_key_key" ON "go_incentive_runs"("kind", "period_key");

-- AddForeignKey
ALTER TABLE "go_goal_campaigns" ADD CONSTRAINT "go_goal_campaigns_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_incentive_grants" ADD CONSTRAINT "go_driver_incentive_grants_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "go_goal_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
