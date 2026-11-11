-- CreateTable
CREATE TABLE IF NOT EXISTS "go_app_branding" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "version" INTEGER NOT NULL DEFAULT 1,
    "published_json" JSONB NOT NULL,
    "draft_json" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_app_branding_pkey" PRIMARY KEY ("id")
);
