-- AlterTable
ALTER TABLE "go_rides" ADD COLUMN     "pickup_sign_name" VARCHAR(60),
ADD COLUMN     "share_tracking_link" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tracking_token" VARCHAR(64);

-- CreateIndex
CREATE UNIQUE INDEX "go_rides_tracking_token_key" ON "go_rides"("tracking_token");
