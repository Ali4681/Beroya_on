-- Split singleton app branding / app info into customer + driver identities.

INSERT INTO "go_app_branding" ("id", "version", "published_json", "draft_json", "updated_at")
SELECT 'customer', "version", "published_json", "draft_json", NOW()
FROM "go_app_branding"
WHERE "id" = 'default'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "go_app_branding" ("id", "version", "published_json", "draft_json", "updated_at")
SELECT 'driver', "version", "published_json", "draft_json", NOW()
FROM "go_app_branding"
WHERE "id" = 'default'
ON CONFLICT ("id") DO NOTHING;

DELETE FROM "go_app_branding" WHERE "id" = 'default';

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
)
SELECT
  'customer',
  "support_phone",
  "support_whatsapp",
  "support_email",
  "terms_url",
  "privacy_url",
  "about_ar",
  "min_supported_version",
  "latest_version",
  NOW()
FROM "go_app_info"
WHERE "id" = 'default'
ON CONFLICT ("id") DO NOTHING;

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
)
SELECT
  'driver',
  "support_phone",
  "support_whatsapp",
  "support_email",
  "terms_url",
  "privacy_url",
  "about_ar",
  "min_supported_version",
  "latest_version",
  NOW()
FROM "go_app_info"
WHERE "id" = 'default'
ON CONFLICT ("id") DO NOTHING;

DELETE FROM "go_app_info" WHERE "id" = 'default';
