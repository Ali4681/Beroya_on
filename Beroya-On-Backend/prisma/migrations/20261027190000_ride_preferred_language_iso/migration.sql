-- Ride preferred driver language: ISO 639-1 text (was GoLanguage AR/EN only).
ALTER TABLE "go_rides" ALTER COLUMN "preferred_driver_language" DROP DEFAULT;
ALTER TABLE "go_rides"
  ALTER COLUMN "preferred_driver_language" TYPE TEXT
  USING (
    CASE "preferred_driver_language"::text
      WHEN 'AR' THEN 'ar'
      WHEN 'EN' THEN 'en'
      ELSE lower("preferred_driver_language"::text)
    END
  );
ALTER TABLE "go_rides" ALTER COLUMN "preferred_driver_language" SET DEFAULT 'ar';
