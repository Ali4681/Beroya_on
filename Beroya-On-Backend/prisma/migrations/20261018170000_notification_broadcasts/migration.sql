-- CreateEnum
CREATE TYPE "GoNotificationBroadcastStatus" AS ENUM ('SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "go_notification_broadcasts" (
    "id" TEXT NOT NULL,
    "audience" VARCHAR(20) NOT NULL,
    "title" VARCHAR(80) NOT NULL,
    "body" VARCHAR(280) NOT NULL,
    "status" "GoNotificationBroadcastStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "devices_queued" INTEGER,
    "inbox_count" INTEGER,
    "job_id" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_notification_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_notification_broadcasts_created_at_idx" ON "go_notification_broadcasts"("created_at");

-- CreateIndex
CREATE INDEX "go_notification_broadcasts_status_scheduled_at_idx" ON "go_notification_broadcasts"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "go_notification_broadcasts_created_by_id_created_at_idx" ON "go_notification_broadcasts"("created_by_id", "created_at");

-- AddForeignKey
ALTER TABLE "go_notification_broadcasts" ADD CONSTRAINT "go_notification_broadcasts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
