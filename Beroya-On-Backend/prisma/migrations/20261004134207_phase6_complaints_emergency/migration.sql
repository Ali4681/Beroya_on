-- CreateEnum
CREATE TYPE "GoComplaintStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GoComplaintPriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "GoEmergencyStatus" AS ENUM ('ACTIVE', 'HANDLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GoEmergencyRecordingStatus" AS ENUM ('LIVE', 'PENDING_DECISION', 'SAVED', 'DELETED');

-- CreateTable
CREATE TABLE "go_complaints" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "priority" "GoComplaintPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "GoComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "reason_code" TEXT NOT NULL,
    "notes" TEXT,
    "staff_notes" TEXT,
    "submitted_during_ride" BOOLEAN NOT NULL DEFAULT false,
    "assigned_to_id" TEXT,
    "resolved_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_emergency_sessions" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "status" "GoEmergencyStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "started_lat" DECIMAL(10,7),
    "started_lng" DECIMAL(10,7),
    "handled_by_id" TEXT,
    "recording_status" "GoEmergencyRecordingStatus" NOT NULL DEFAULT 'LIVE',
    "recording_storage_key" TEXT,
    "saved_by_id" TEXT,
    "saved_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_emergency_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "go_complaints_branch_id_status_idx" ON "go_complaints"("branch_id", "status");

-- CreateIndex
CREATE INDEX "go_complaints_ride_id_idx" ON "go_complaints"("ride_id");

-- CreateIndex
CREATE INDEX "go_complaints_priority_status_idx" ON "go_complaints"("priority", "status");

-- CreateIndex
CREATE INDEX "go_emergency_sessions_branch_id_status_idx" ON "go_emergency_sessions"("branch_id", "status");

-- CreateIndex
CREATE INDEX "go_emergency_sessions_ride_id_idx" ON "go_emergency_sessions"("ride_id");

-- AddForeignKey
ALTER TABLE "go_complaints" ADD CONSTRAINT "go_complaints_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_complaints" ADD CONSTRAINT "go_complaints_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_complaints" ADD CONSTRAINT "go_complaints_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_complaints" ADD CONSTRAINT "go_complaints_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_complaints" ADD CONSTRAINT "go_complaints_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_complaints" ADD CONSTRAINT "go_complaints_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_emergency_sessions" ADD CONSTRAINT "go_emergency_sessions_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_emergency_sessions" ADD CONSTRAINT "go_emergency_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_emergency_sessions" ADD CONSTRAINT "go_emergency_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_emergency_sessions" ADD CONSTRAINT "go_emergency_sessions_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_emergency_sessions" ADD CONSTRAINT "go_emergency_sessions_saved_by_id_fkey" FOREIGN KEY ("saved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_emergency_sessions" ADD CONSTRAINT "go_emergency_sessions_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
