-- CreateTable
CREATE TABLE "go_notification_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "customer_birthday_title" VARCHAR(80) NOT NULL DEFAULT 'عيد ميلاد سعيد',
    "customer_birthday_body" VARCHAR(280) NOT NULL DEFAULT 'كل عام وأنت بخير! نتمنى لك يوماً سعيداً مع بيرويا.',
    "driver_birthday_title" VARCHAR(80) NOT NULL DEFAULT 'عيد ميلاد سعيد',
    "driver_birthday_body" VARCHAR(280) NOT NULL DEFAULT 'كل عام وأنت بخير! شكراً لكونك جزءاً من عائلة بيرويا.',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "go_notification_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "go_notification_config" ("id", "updated_at")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
