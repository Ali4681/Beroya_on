-- AlterTable
ALTER TABLE "go_driver_profiles" ADD COLUMN "preferred_language" "GoLanguage" NOT NULL DEFAULT 'AR';

-- CreateTable
CREATE TABLE "go_driver_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "payload" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_driver_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_driver_notifications_user_id_created_at_idx" ON "go_driver_notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "go_driver_notifications_user_id_read_at_idx" ON "go_driver_notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "go_driver_notifications" ADD CONSTRAINT "go_driver_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: support messages may come from drivers
ALTER TABLE "go_support_messages" ALTER COLUMN "customer_id" DROP NOT NULL;
ALTER TABLE "go_support_messages" ADD COLUMN "driver_id" TEXT;

-- CreateIndex
CREATE INDEX "go_support_messages_driver_id_created_at_idx" ON "go_support_messages"("driver_id", "created_at");

-- AddForeignKey
ALTER TABLE "go_support_messages" ADD CONSTRAINT "go_support_messages_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
