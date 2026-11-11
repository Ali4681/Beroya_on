-- CreateEnum
CREATE TYPE "GoRatingDirection" AS ENUM ('CUSTOMER_TO_DRIVER', 'DRIVER_TO_CUSTOMER');

-- CreateTable
CREATE TABLE "go_ride_ratings" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "direction" "GoRatingDirection" NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_ride_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_ride_rating_reasons" (
    "id" TEXT NOT NULL,
    "rating_id" TEXT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_ride_rating_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_ride_ratings_ride_id_direction_key" ON "go_ride_ratings"("ride_id", "direction");

-- CreateIndex
CREATE INDEX "go_ride_ratings_from_user_id_idx" ON "go_ride_ratings"("from_user_id");

-- CreateIndex
CREATE INDEX "go_ride_ratings_to_user_id_idx" ON "go_ride_ratings"("to_user_id");

-- CreateIndex
CREATE INDEX "go_ride_rating_reasons_rating_id_idx" ON "go_ride_rating_reasons"("rating_id");

-- AddForeignKey
ALTER TABLE "go_ride_ratings" ADD CONSTRAINT "go_ride_ratings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_ratings" ADD CONSTRAINT "go_ride_ratings_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_ratings" ADD CONSTRAINT "go_ride_ratings_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_rating_reasons" ADD CONSTRAINT "go_ride_rating_reasons_rating_id_fkey" FOREIGN KEY ("rating_id") REFERENCES "go_ride_ratings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
