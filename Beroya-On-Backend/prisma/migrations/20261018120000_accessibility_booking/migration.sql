-- ACCESSIBILITY booking + personal assistance / wheelchair requirement types.

ALTER TYPE "GoRideRequirementType" ADD VALUE 'PERSONAL_ASSISTANCE';
ALTER TYPE "GoRideRequirementType" ADD VALUE 'WHEELCHAIR';

UPDATE "go_services" SET "is_available" = true, "is_visible" = true WHERE "code" = 'ACCESSIBILITY';
