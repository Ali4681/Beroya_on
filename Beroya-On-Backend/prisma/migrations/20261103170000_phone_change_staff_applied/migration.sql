-- Desk-applied driver phone changes (no OTP), listed under a dedicated filter.

ALTER TYPE "GoDriverPhoneChangeStatus" ADD VALUE IF NOT EXISTS 'STAFF_APPLIED';
