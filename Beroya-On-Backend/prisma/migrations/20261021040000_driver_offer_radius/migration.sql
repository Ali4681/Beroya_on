-- Fixed driver offer / map-circle radius (single source of truth for Flutter circle + dispatch).
ALTER TABLE "go_dispatch_config"
  ADD COLUMN IF NOT EXISTS "driver_offer_radius_m" INTEGER NOT NULL DEFAULT 500;
