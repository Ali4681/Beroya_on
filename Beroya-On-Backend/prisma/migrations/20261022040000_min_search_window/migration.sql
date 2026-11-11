-- Minimum SEARCHING window before FAILED_NO_DRIVER (fixed offer radius / Option A).
ALTER TABLE "go_dispatch_config"
  ADD COLUMN IF NOT EXISTS "min_search_seconds" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "go_dispatch_config"
  ADD COLUMN IF NOT EXISTS "empty_search_retry_seconds" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "go_rides"
  ADD COLUMN IF NOT EXISTS "search_started_at" TIMESTAMP(3);
