-- Driver mother tongue (primary spoken language).
ALTER TABLE "go_driver_profiles" ADD COLUMN "mother_tongue" "GoLanguage" NOT NULL DEFAULT 'AR';
