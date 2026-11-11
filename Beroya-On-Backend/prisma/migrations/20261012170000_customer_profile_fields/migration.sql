-- AlterTable
ALTER TABLE "go_customer_profiles" ADD COLUMN     "avatar_key" TEXT,
ADD COLUMN     "city" VARCHAR(80),
ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "email" VARCHAR(254),
ADD COLUMN     "gender" "GoDriverGender" NOT NULL DEFAULT 'UNSPECIFIED',
ADD COLUMN     "preferred_currency" VARCHAR(3) NOT NULL DEFAULT 'SYP';
