-- CreateTable
CREATE TABLE "go_customer_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "payload" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_customer_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_customer_notifications_user_id_created_at_idx" ON "go_customer_notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "go_customer_notifications_user_id_read_at_idx" ON "go_customer_notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "go_customer_notifications" ADD CONSTRAINT "go_customer_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
