-- AMBULANCE catalog row + dedicated ride category (distance pricing like DAILY).

INSERT INTO "go_services" ("code", "name_ar", "name_en", "is_available", "is_visible", "sort_order", "updated_at")
VALUES ('AMBULANCE', 'إسعاف', 'Ambulance', true, true, 8, CURRENT_TIMESTAMP);

INSERT INTO "go_ride_categories" ("id", "code", "name_ar", "name_en", "is_active", "sort_order", "max_passengers", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'AMBULANCE', 'إسعاف', 'Ambulance', true, 8, 3, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "go_ride_pricing" ("id", "ride_category_id", "base_fare", "price_per_km", "price_per_minute", "minimum_fare", "currency", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid()::text, c."id", 2000, 600, 100, 4000, 'SYP', true, NOW(), NOW()
FROM "go_ride_categories" c
WHERE c."code" = 'AMBULANCE'
  AND NOT EXISTS (
    SELECT 1 FROM "go_ride_pricing" p WHERE p."ride_category_id" = c."id"
  );
