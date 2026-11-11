-- HR employee files (desk hiring wizard). base_salary is required; other fields optional.

CREATE TABLE "go_employees" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "branch_id" TEXT,
    "full_name_ar" VARCHAR(200),
    "full_name_en" VARCHAR(200),
    "phone" VARCHAR(32),
    "email" VARCHAR(254),
    "date_of_birth" DATE,
    "gender" VARCHAR(32),
    "marital_status" VARCHAR(32),
    "national_id" VARCHAR(64),
    "nationality" VARCHAR(100),
    "blood_type" VARCHAR(16),
    "allergies" VARCHAR(500),
    "address" VARCHAR(1000),
    "emergency_contact" VARCHAR(200),
    "emergency_phone" VARCHAR(32),
    "contract_number" VARCHAR(64),
    "contract_type" VARCHAR(32),
    "employment_status" VARCHAR(32),
    "start_date" DATE,
    "decision_date" DATE,
    "daily_hours" DECIMAL(4,1),
    "work_days_per_week" INTEGER,
    "work_location" VARCHAR(300),
    "confidentiality_notes" VARCHAR(4000),
    "allowances_json" JSONB,
    "attachments_json" JSONB,
    "signatures_json" JSONB,
    "base_salary" DECIMAL(14,2) NOT NULL,
    "salary_currency" VARCHAR(8) NOT NULL DEFAULT 'SYP',
    "insurance_number" VARCHAR(64),
    "commissions_json" JSONB,
    "custody_json" JSONB,
    "specialization" VARCHAR(200),
    "university" VARCHAR(200),
    "graduation_year" INTEGER,
    "skills" VARCHAR(1000),
    "certificates_json" JSONB,
    "languages_json" JSONB,
    "licenses_json" JSONB,
    "documents_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_employees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "go_employees_user_id_key" ON "go_employees"("user_id");
CREATE UNIQUE INDEX "go_employees_contract_number_key" ON "go_employees"("contract_number");
CREATE INDEX "go_employees_branch_id_created_at_idx" ON "go_employees"("branch_id", "created_at");
CREATE INDEX "go_employees_full_name_ar_idx" ON "go_employees"("full_name_ar");

ALTER TABLE "go_employees" ADD CONSTRAINT "go_employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "go_employees" ADD CONSTRAINT "go_employees_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
