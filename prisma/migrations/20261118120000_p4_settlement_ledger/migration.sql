-- Part 4: settlement ledger, release window, disputes and withdrawals.
-- Additive only: new enum values/columns/tables; existing rows stay readable.
-- Rollback: see the comment at the end of this file.

ALTER TYPE "PayoutStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIVED';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'SELLER_PENDING';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'SELLER_RELEASE';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'COMMISSION';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'DISPUTE_HOLD';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'DISPUTE_RELEASE';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'WITHDRAWAL_RESERVE';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'WITHDRAWAL_PAID';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'WITHDRAWAL_REJECTED';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'COD_DUES_ACCRUAL';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'COD_DUES_PAYMENT';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'REFUND_PAYABLE_CREATED';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'REFUND_PAID';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'ADJUSTMENT_DEBIT';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'ADJUSTMENT_CREDIT';

CREATE TYPE "LedgerAccount" AS ENUM (
  'BUYER_RECEIPTS',
  'PLATFORM_HOLDINGS',
  'SELLER_PENDING',
  'SELLER_AVAILABLE',
  'SELLER_ON_HOLD',
  'SELLER_WITHDRAWAL_RESERVED',
  'SELLER_PAID_OUT',
  'REFUND_PAYABLE',
  'REFUNDS_PAID',
  'PLATFORM_COMMISSION',
  'COD_DUES'
);

CREATE TYPE "DisputeDecision" AS ENUM (
  'PENDING',
  'REJECTED',
  'REFUND_FULL',
  'REFUND_PARTIAL',
  'RETURN_TO_SELLER'
);

ALTER TABLE "LedgerEntry" ALTER COLUMN "sellerProfileId" DROP NOT NULL;
ALTER TABLE "LedgerEntry"
  ADD COLUMN "orderId" TEXT,
  ADD COLUMN "paymentId" TEXT,
  ADD COLUMN "disputeId" TEXT,
  ADD COLUMN "withdrawalId" TEXT,
  ADD COLUMN "account" "LedgerAccount",
  ADD COLUMN "releaseAt" TIMESTAMP(3),
  ADD COLUMN "batchId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "LedgerEntry_idempotencyKey_key" ON "LedgerEntry"("idempotencyKey");
CREATE INDEX "LedgerEntry_account_releaseAt_idx" ON "LedgerEntry"("account", "releaseAt");
CREATE INDEX "LedgerEntry_batchId_idx" ON "LedgerEntry"("batchId");

ALTER TABLE "ShopOrder"
  ADD COLUMN "releaseAt" TIMESTAMP(3),
  ADD COLUMN "fundsReleasedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryVerifiedById" TEXT,
  ADD COLUMN "deliveryProofUrl" TEXT;

CREATE INDEX "ShopOrder_status_releaseAt_idx" ON "ShopOrder"("status", "releaseAt");

ALTER TABLE "Complaint"
  ADD COLUMN "decision" "DisputeDecision" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "sellerResponseDueAt" TIMESTAMP(3),
  ADD COLUMN "sellerRespondedAt" TIMESTAMP(3),
  ADD COLUMN "fundsHeldAt" TIMESTAMP(3),
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "refundAmount" DECIMAL(12,2);

ALTER TABLE "Payout"
  ADD COLUMN "requestedById" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "balanceSnapshot" DECIMAL(12,2),
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "Payout_idempotencyKey_key" ON "Payout"("idempotencyKey");
CREATE INDEX "Payout_status_createdAt_idx" ON "Payout"("status", "createdAt");

ALTER TABLE "SellerPayoutAccount"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Rollback:
-- DROP INDEX "Payout_status_createdAt_idx";
-- DROP INDEX "Payout_idempotencyKey_key";
-- ALTER TABLE "Payout" DROP COLUMN "updatedAt", DROP COLUMN "idempotencyKey",
--   DROP COLUMN "balanceSnapshot", DROP COLUMN "rejectionReason", DROP COLUMN "requestedById";
-- ALTER TABLE "SellerPayoutAccount" DROP COLUMN "updatedAt";
-- ALTER TABLE "Complaint" DROP COLUMN "refundAmount", DROP COLUMN "decidedAt",
--   DROP COLUMN "fundsHeldAt", DROP COLUMN "sellerRespondedAt", DROP COLUMN "sellerResponseDueAt",
--   DROP COLUMN "decision";
-- DROP INDEX "ShopOrder_status_releaseAt_idx";
-- ALTER TABLE "ShopOrder" DROP COLUMN "deliveryProofUrl", DROP COLUMN "deliveryVerifiedById",
--   DROP COLUMN "fundsReleasedAt", DROP COLUMN "releaseAt";
-- DROP INDEX "LedgerEntry_batchId_idx";
-- DROP INDEX "LedgerEntry_account_releaseAt_idx";
-- DROP INDEX "LedgerEntry_idempotencyKey_key";
-- ALTER TABLE "LedgerEntry" DROP COLUMN "idempotencyKey", DROP COLUMN "batchId",
--   DROP COLUMN "releaseAt", DROP COLUMN "account", DROP COLUMN "withdrawalId",
--   DROP COLUMN "disputeId", DROP COLUMN "paymentId", DROP COLUMN "orderId";
-- ALTER TABLE "LedgerEntry" ALTER COLUMN "sellerProfileId" SET NOT NULL;
-- DROP TYPE "DisputeDecision";
-- DROP TYPE "LedgerAccount";
-- Enum values cannot be removed in PostgreSQL without recreating the type; leave them.
