-- Spoken languages: ISO 639-1 text codes (was GoLanguage enum AR/EN only).
ALTER TABLE "go_driver_profiles" ALTER COLUMN "mother_tongue" DROP DEFAULT;
ALTER TABLE "go_driver_profiles"
  ALTER COLUMN "mother_tongue" TYPE TEXT
  USING (
    CASE "mother_tongue"::text
      WHEN 'AR' THEN 'ar'
      WHEN 'EN' THEN 'en'
      ELSE lower("mother_tongue"::text)
    END
  );
ALTER TABLE "go_driver_profiles" ALTER COLUMN "mother_tongue" SET DEFAULT 'ar';

ALTER TABLE "go_driver_profiles" ALTER COLUMN "languages" DROP DEFAULT;
-- Enum values are only AR/EN. A subquery is illegal inside ALTER COLUMN USING.
ALTER TABLE "go_driver_profiles"
  ALTER COLUMN "languages" TYPE TEXT[]
  USING (
    COALESCE(
      replace(replace("languages"::text, 'AR', 'ar'), 'EN', 'en')::text[],
      ARRAY[]::TEXT[]
    )
  );
ALTER TABLE "go_driver_profiles" ALTER COLUMN "languages" SET DEFAULT ARRAY[]::TEXT[];
