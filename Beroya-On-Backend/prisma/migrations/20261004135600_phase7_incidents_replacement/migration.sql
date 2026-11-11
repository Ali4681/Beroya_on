-- CreateEnum
CREATE TYPE "GoCaseType" AS ENUM ('ACCIDENT', 'BREAKDOWN');

-- CreateEnum
CREATE TYPE "GoCaseStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "GoAccidentSeverity" AS ENUM ('SIMPLE', 'MEDIUM', 'SEVERE');

-- CreateEnum
CREATE TYPE "GoDriverEntitlementStatus" AS ENUM ('CALCULATED', 'UNDER_REVIEW', 'APPROVED', 'PARTIAL', 'REJECTED', 'SETTLED');

-- CreateTable
CREATE TABLE "go_ride_cases" (
    "id" TEXT NOT NULL,
    "case_number" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "driver_id" TEXT,
    "type" "GoCaseType" NOT NULL,
    "status" "GoCaseStatus" NOT NULL DEFAULT 'OPEN',
    "accident_severity" "GoAccidentSeverity",
    "reason_code" TEXT,
    "source_alert_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "customer_statement" TEXT,
    "driver_statement" TEXT,
    "negligence_suspected" BOOLEAN,
    "supervisor_decision" TEXT,
    "replacement_ride_id" TEXT,
    "closed_by_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_ride_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_ride_case_notes" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_ride_case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_driver_entitlements" (
    "id" TEXT NOT NULL,
    "ride_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "calculated_amount" DECIMAL(18,2) NOT NULL,
    "approved_amount" DECIMAL(18,2),
    "status" "GoDriverEntitlementStatus" NOT NULL DEFAULT 'CALCULATED',
    "negligence_related" BOOLEAN NOT NULL DEFAULT false,
    "finance_notes" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_driver_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_ride_cases_case_number_key" ON "go_ride_cases"("case_number");

-- CreateIndex
CREATE UNIQUE INDEX "go_ride_cases_source_alert_id_key" ON "go_ride_cases"("source_alert_id");

-- CreateIndex
CREATE INDEX "go_ride_cases_branch_id_status_idx" ON "go_ride_cases"("branch_id", "status");

-- CreateIndex
CREATE INDEX "go_ride_cases_ride_id_type_idx" ON "go_ride_cases"("ride_id", "type");

-- CreateIndex
CREATE INDEX "go_ride_cases_type_status_idx" ON "go_ride_cases"("type", "status");

-- CreateIndex
CREATE INDEX "go_ride_case_notes_case_id_idx" ON "go_ride_case_notes"("case_id");

-- CreateIndex
CREATE INDEX "go_driver_entitlements_status_idx" ON "go_driver_entitlements"("status");

-- CreateIndex
CREATE INDEX "go_driver_entitlements_driver_id_idx" ON "go_driver_entitlements"("driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "go_driver_entitlements_ride_id_driver_id_key" ON "go_driver_entitlements"("ride_id", "driver_id");

-- CreateIndex
CREATE INDEX "go_rides_replacement_of_ride_id_idx" ON "go_rides"("replacement_of_ride_id");

-- AddForeignKey
ALTER TABLE "go_ride_cases" ADD CONSTRAINT "go_ride_cases_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_cases" ADD CONSTRAINT "go_ride_cases_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_cases" ADD CONSTRAINT "go_ride_cases_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "go_customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_cases" ADD CONSTRAINT "go_ride_cases_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_cases" ADD CONSTRAINT "go_ride_cases_replacement_ride_id_fkey" FOREIGN KEY ("replacement_ride_id") REFERENCES "go_rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_cases" ADD CONSTRAINT "go_ride_cases_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_case_notes" ADD CONSTRAINT "go_ride_case_notes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "go_ride_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_ride_case_notes" ADD CONSTRAINT "go_ride_case_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_entitlements" ADD CONSTRAINT "go_driver_entitlements_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "go_rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_entitlements" ADD CONSTRAINT "go_driver_entitlements_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "go_driver_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_driver_entitlements" ADD CONSTRAINT "go_driver_entitlements_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
