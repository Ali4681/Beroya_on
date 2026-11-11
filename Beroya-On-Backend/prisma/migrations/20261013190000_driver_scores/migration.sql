-- CreateEnum
CREATE TYPE "GoOnlineSessionEnd" AS ENUM ('DRIVER_OFFLINE', 'FORCED_OFFLINE', 'STALE_LOCATION');

-- CreateEnum
CREATE TYPE "GoDriverScoreBand" AS ENUM ('KEEP', 'WATCH', 'REPLACEABLE');

-- AlterTable
ALTER TABLE "go_incentive_config" ADD COLUMN     "band_keep" DECIMAL(5,2) NOT NULL DEFAULT 75,
ADD COLUMN     "band_watch" DECIMAL(5,2) NOT NULL DEFAULT 50,
ADD COLUMN     "score_window_days" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "weight_acceptance" DECIMAL(5,2) NOT NULL DEFAULT 25,
ADD COLUMN     "weight_cancel" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "weight_earnings" DECIMAL(5,2) NOT NULL DEFAULT 25,
ADD COLUMN     "weight_hours" DECIMAL(5,2) NOT NULL DEFAULT 20,
ADD COLUMN     "weight_rating" DECIMAL(5,2) NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "go_driver_online_sessions" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "end_reason" "GoOnlineSessionEnd",

    CONSTRAINT "go_driver_online_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_driver_score_snapshots" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "day" VARCHAR(10) NOT NULL,
    "window_days" INTEGER NOT NULL,
    "rating" DECIMAL(3,2),
    "ratings_count" INTEGER NOT NULL DEFAULT 0,
    "acceptance_pct" DECIMAL(5,2),
    "offers_count" INTEGER NOT NULL DEFAULT 0,
    "online_hours" DECIMAL(8,2) NOT NULL,
    "earnings" DECIMAL(18,2) NOT NULL,
    "completed" INTEGER NOT NULL,
    "cancel_pct" DECIMAL(5,2),
    "score" DECIMAL(5,2) NOT NULL,
    "band" "GoDriverScoreBand" NOT NULL,
    "breakdown" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_driver_score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_driver_online_sessions_driver_id_started_at_idx" ON "go_driver_online_sessions"("driver_id", "started_at");

-- CreateIndex
CREATE INDEX "go_driver_online_sessions_ended_at_idx" ON "go_driver_online_sessions"("ended_at");

-- CreateIndex
CREATE INDEX "go_driver_score_snapshots_day_score_idx" ON "go_driver_score_snapshots"("day", "score");

-- CreateIndex
CREATE UNIQUE INDEX "go_driver_score_snapshots_driver_id_day_key" ON "go_driver_score_snapshots"("driver_id", "day");

-- AddForeignKey
ALTER TABLE "go_driver_online_sessions" ADD CONSTRAINT "go_driver_online_sessions_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_score_snapshots" ADD CONSTRAINT "go_driver_score_snapshots_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drivers already available start their first session now.
INSERT INTO "go_driver_online_sessions" ("id", "driver_id", "started_at")
  SELECT gen_random_uuid()::text, "driver_id", (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
FROM "go_driver_states"
WHERE "availability" <> 'OFFLINE';
