-- CreateEnum
CREATE TYPE "GoSupportMessageStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

-- CreateTable
CREATE TABLE "go_support_messages" (
    "id" TEXT NOT NULL,
    "reference" VARCHAR(20) NOT NULL,
    "customer_id" TEXT NOT NULL,
    "full_name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "email" VARCHAR(254),
    "message" VARCHAR(2000) NOT NULL,
    "status" "GoSupportMessageStatus" NOT NULL DEFAULT 'OPEN',
    "claimed_by_id" TEXT,
    "reply" VARCHAR(4000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "go_support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_support_messages_reference_key" ON "go_support_messages"("reference");

-- CreateIndex
CREATE INDEX "go_support_messages_customer_id_created_at_idx" ON "go_support_messages"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "go_support_messages_status_created_at_idx" ON "go_support_messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "go_complaints_customer_id_created_at_idx" ON "go_complaints"("customer_id", "created_at");

-- AddForeignKey
ALTER TABLE "go_support_messages" ADD CONSTRAINT "go_support_messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_support_messages" ADD CONSTRAINT "go_support_messages_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
