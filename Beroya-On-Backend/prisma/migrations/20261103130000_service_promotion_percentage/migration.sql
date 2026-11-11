-- AlterTable
ALTER TABLE "go_services" ADD COLUMN "promotion_percentage" DECIMAL(5,2);

-- Backfill: numeric badge labels (e.g. "10", "15%") become real fare discounts.
UPDATE "go_services"
SET "promotion_percentage" = CASE
  WHEN trim(both FROM "promotion_label_ar") ~ '^[0-9]+([.][0-9]+)?%?$'
    THEN least(
      100::numeric,
      nullif(regexp_replace(trim(both FROM "promotion_label_ar"), '%$', ''), '')::numeric
    )
  ELSE NULL
END
WHERE "promotion_label_ar" IS NOT NULL
  AND "promotion_percentage" IS NULL;
