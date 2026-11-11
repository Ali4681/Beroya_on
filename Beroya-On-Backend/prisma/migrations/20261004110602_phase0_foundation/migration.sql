-- CreateEnum
CREATE TYPE "GoRole" AS ENUM ('CUSTOMER', 'DRIVER', 'CUSTOMER_SERVICE', 'CUSTOMER_SERVICE_SUPERVISOR', 'OPERATIONS', 'WALLET_OPERATOR', 'FINANCE', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "GoDevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "GoOtpPurpose" AS ENUM ('CUSTOMER_LOGIN', 'DRIVER_LOGIN');

-- CreateEnum
CREATE TYPE "GoIdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "go_branches" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "role" "GoRole" NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "password_hash" TEXT,
    "full_name" TEXT,
    "branch_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_id" TEXT,
    "device_name" TEXT,
    "platform" "GoDevicePlatform",
    "ip" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_otp_requests" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" "GoOtpPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_otp_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "actor_role" "GoRole",
    "branch_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "go_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "go_idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" "GoIdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "go_branches_code_key" ON "go_branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_branch_id_idx" ON "users"("branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_role_key" ON "users"("phone", "role");

-- CreateIndex
CREATE INDEX "go_user_sessions_user_id_idx" ON "go_user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "go_otp_requests_phone_purpose_created_at_idx" ON "go_otp_requests"("phone", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "go_audit_logs_entity_type_entity_id_idx" ON "go_audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "go_audit_logs_actor_user_id_created_at_idx" ON "go_audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "go_audit_logs_action_created_at_idx" ON "go_audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "go_idempotency_keys_expires_at_idx" ON "go_idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "go_idempotency_keys_user_id_key_key" ON "go_idempotency_keys"("user_id", "key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "go_branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "go_user_sessions" ADD CONSTRAINT "go_user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
