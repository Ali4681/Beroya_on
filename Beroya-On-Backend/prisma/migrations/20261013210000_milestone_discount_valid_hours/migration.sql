-- AlterTable
ALTER TABLE "go_passport_milestone_reward_configs" ADD COLUMN "discount_valid_hours" INTEGER NOT NULL DEFAULT 720;

UPDATE "go_passport_milestone_reward_configs" SET "discount_valid_hours" = "discount_valid_days" * 24;

ALTER TABLE "go_passport_milestone_reward_configs" DROP COLUMN "discount_valid_days";
