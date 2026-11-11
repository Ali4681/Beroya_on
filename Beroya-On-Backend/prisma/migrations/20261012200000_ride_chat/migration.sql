-- CreateEnum
CREATE TYPE "GoChatSenderRole" AS ENUM ('CUSTOMER', 'DRIVER');

-- CreateEnum
CREATE TYPE "GoChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'VOICE');

-- CreateTable
CREATE TABLE "go_ride_messages" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "ride_id" TEXT NOT NULL,
    "client_id" VARCHAR(32) NOT NULL,
    "sender_role" "GoChatSenderRole" NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "type" "GoChatMessageType" NOT NULL,
    "text" VARCHAR(1000),
    "media_key" TEXT,
    "media_mime" VARCHAR(40),
    "duration_sec" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "go_ride_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_ride_messages_seq_key" ON "go_ride_messages"("seq");

-- CreateIndex
CREATE INDEX "go_ride_messages_ride_id_seq_idx" ON "go_ride_messages"("ride_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "go_ride_messages_ride_id_sender_role_client_id_key" ON "go_ride_messages"("ride_id", "sender_role", "client_id");

-- AddForeignKey
ALTER TABLE "go_ride_messages" ADD CONSTRAINT "go_ride_messages_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_messages" ADD CONSTRAINT "go_ride_messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
