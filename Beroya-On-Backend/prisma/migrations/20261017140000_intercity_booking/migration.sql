-- INTERCITY booking: city centroids for customer city picker + enable catalog.
ALTER TABLE "go_cities" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "go_cities" ADD COLUMN "lng" DOUBLE PRECISION;

UPDATE "go_cities" SET "lat" = 36.2021, "lng" = 37.1343 WHERE "name_ar" = 'حلب';
UPDATE "go_cities" SET "lat" = 33.5138, "lng" = 36.2765 WHERE "name_ar" = 'دمشق';
UPDATE "go_cities" SET "lat" = 34.7268, "lng" = 36.7234 WHERE "name_ar" = 'حمص';
UPDATE "go_cities" SET "lat" = 35.5317, "lng" = 35.7906 WHERE "name_ar" = 'اللاذقية';
UPDATE "go_cities" SET "lat" = 35.1318, "lng" = 36.7578 WHERE "name_ar" = 'حماة';
UPDATE "go_cities" SET "lat" = 34.8890, "lng" = 35.8866 WHERE "name_ar" = 'طرطوس';

UPDATE "go_services" SET "is_available" = true, "is_visible" = true WHERE "code" = 'INTERCITY';
