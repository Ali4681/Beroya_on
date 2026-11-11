-- Staff desk profile photo (shown in account menu).

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_key" TEXT;
