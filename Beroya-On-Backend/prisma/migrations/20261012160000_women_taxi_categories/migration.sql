-- Design category set: ECONOMY (يومي), VIP, FAMILY, WOMEN, XL (مجموعات كبيرة), TAXI.

-- New categories
INSERT INTO "go_ride_categories" ("id", "code", "name_ar", "name_en", "is_active", "sort_order", "max_passengers", "created_at", "updated_at")
VALUES
  (gen_random_uuid()::text, 'WOMEN', 'سيدات', 'Women', true, 4, 4, NOW(), NOW()),
  (gen_random_uuid()::text, 'TAXI', 'تكسي', 'Taxi', true, 6, 4, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "go_ride_pricing" ("id", "ride_category_id", "base_fare", "price_per_km", "price_per_minute", "minimum_fare", "currency", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid()::text, c."id", p.base, p.km, p.min, p.minimum, 'SYP', true, NOW(), NOW()
FROM "go_ride_categories" c
JOIN (VALUES
  ('WOMEN', 1200, 450, 90, 3000),
  ('TAXI', 1000, 400, 80, 2500)
) AS p(code, base, km, min, minimum) ON p.code = c."code"
ON CONFLICT ("ride_category_id") DO NOTHING;

-- COMFORT is not in the design; keep it for ride history but hide it from customers.
UPDATE "go_ride_categories" SET "is_active" = false, "updated_at" = NOW() WHERE "code" = 'COMFORT';

-- Design names and order (only where the seed defaults were never edited).
UPDATE "go_ride_categories" SET "name_ar" = 'يومي', "name_en" = 'Daily', "updated_at" = NOW()
  WHERE "code" = 'ECONOMY' AND "name_ar" = 'اقتصادي';
UPDATE "go_ride_categories" SET "name_ar" = 'مجموعات كبيرة', "name_en" = 'Large group', "updated_at" = NOW()
  WHERE "code" = 'XL' AND "name_ar" = 'كبير';
UPDATE "go_ride_categories" SET "sort_order" = 1 WHERE "code" = 'ECONOMY';
UPDATE "go_ride_categories" SET "sort_order" = 2 WHERE "code" = 'VIP';
UPDATE "go_ride_categories" SET "sort_order" = 3 WHERE "code" = 'FAMILY';
UPDATE "go_ride_categories" SET "sort_order" = 5 WHERE "code" = 'XL';
UPDATE "go_ride_categories" SET "sort_order" = 7 WHERE "code" = 'COMFORT';
