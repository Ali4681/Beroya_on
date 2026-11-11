-- CreateTable
CREATE TABLE "go_app_info" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "support_phone" VARCHAR(32),
    "support_whatsapp" VARCHAR(64),
    "support_email" VARCHAR(254),
    "terms_url" VARCHAR(500),
    "privacy_url" VARCHAR(500),
    "about_ar" VARCHAR(4000),
    "min_supported_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "latest_version" VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_app_info_pkey" PRIMARY KEY ("id")
);

-- Seed singleton row
INSERT INTO "go_app_info" (
    "id",
    "support_phone",
    "support_whatsapp",
    "support_email",
    "terms_url",
    "privacy_url",
    "about_ar",
    "min_supported_version",
    "latest_version",
    "updated_at"
) VALUES (
    'default',
    '+963900000000',
    '+963900000000',
    'support@beroya.go',
    'https://beroya.go/terms',
    'https://beroya.go/privacy',
    'برويا — تطبيق نقل يوصلك بأمان في سوريا.',
    '1.0.0',
    '1.0.0',
    CURRENT_TIMESTAMP
);
