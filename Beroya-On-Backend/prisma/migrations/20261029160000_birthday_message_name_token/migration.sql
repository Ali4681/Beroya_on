-- Refresh stock birthday bodies so they include {name}. Custom admin text is left alone.
UPDATE "go_notification_config"
SET
  "customer_birthday_body" = 'كل عام وأنت بخير يا {name}! نتمنى لك يوماً سعيداً مع بيرويا.',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'default'
  AND "customer_birthday_body" = 'كل عام وأنت بخير! نتمنى لك يوماً سعيداً مع بيرويا.';

UPDATE "go_notification_config"
SET
  "driver_birthday_body" = 'كل عام وأنت بخير يا {name}! شكراً لكونك جزءاً من عائلة بيرويا.',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'default'
  AND "driver_birthday_body" = 'كل عام وأنت بخير! شكراً لكونك جزءاً من عائلة بيرويا.';
