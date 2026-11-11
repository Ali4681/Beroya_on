-- AlterEnum: company-funded credit covering the customer fare discount.
ALTER TYPE "GoWalletTransactionType" ADD VALUE IF NOT EXISTS 'DISCOUNT_SUBSIDY';
