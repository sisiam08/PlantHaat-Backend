-- Additive: manual advance-payment intents, submissions, allocations and refunds.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'ADVANCE';

CREATE TYPE "PaymentIntentStatus" AS ENUM ('UNPAID', 'PENDING_VERIFICATION', 'PAID', 'REJECTED', 'EXPIRED', 'PARTIALLY_REFUNDED', 'REFUNDED');
CREATE TYPE "PaymentSubmissionStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "RefundObligationStatus" AS ENUM ('REFUND_REQUIRED', 'REFUND_PAYABLE', 'COMPLETED');

CREATE TABLE "PaymentIntent" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "amountDue" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "status" "PaymentIntentStatus" NOT NULL DEFAULT 'UNPAID',
  "providerSnapshot" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "slaAlertedAt" TIMESTAMP(3),
  "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentIntentAllocation" (
  "id" TEXT NOT NULL,
  "intentId" TEXT NOT NULL,
  "shopOrderId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentIntentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentSubmission" (
  "id" TEXT NOT NULL,
  "intentId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "trxId" TEXT NOT NULL,
  "senderNumber" TEXT NOT NULL,
  "proofUrl" TEXT,
  "status" "PaymentSubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "amountReceived" DECIMAL(12,2),
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentSubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefundObligation" (
  "id" TEXT NOT NULL,
  "intentId" TEXT NOT NULL,
  "shopOrderId" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" "RefundObligationStatus" NOT NULL DEFAULT 'REFUND_REQUIRED',
  "reason" TEXT NOT NULL,
  "refundTrxId" TEXT,
  "completedById" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefundObligation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentIntent_orderId_key" ON "PaymentIntent"("orderId");
CREATE INDEX "PaymentIntent_status_expiresAt_idx" ON "PaymentIntent"("status", "expiresAt");
CREATE INDEX "PaymentIntent_status_createdAt_idx" ON "PaymentIntent"("status", "createdAt");
CREATE UNIQUE INDEX "PaymentIntentAllocation_shopOrderId_key" ON "PaymentIntentAllocation"("shopOrderId");
CREATE INDEX "PaymentIntentAllocation_intentId_idx" ON "PaymentIntentAllocation"("intentId");
CREATE UNIQUE INDEX "PaymentSubmission_provider_trxId_key" ON "PaymentSubmission"("provider", "trxId");
CREATE INDEX "PaymentSubmission_intentId_createdAt_idx" ON "PaymentSubmission"("intentId", "createdAt");
CREATE INDEX "PaymentSubmission_status_createdAt_idx" ON "PaymentSubmission"("status", "createdAt");
CREATE INDEX "RefundObligation_status_createdAt_idx" ON "RefundObligation"("status", "createdAt");
CREATE INDEX "RefundObligation_intentId_idx" ON "RefundObligation"("intentId");

ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentIntentAllocation" ADD CONSTRAINT "PaymentIntentAllocation_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentIntentAllocation" ADD CONSTRAINT "PaymentIntentAllocation_shopOrderId_fkey" FOREIGN KEY ("shopOrderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundObligation" ADD CONSTRAINT "RefundObligation_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback:
-- DROP TABLE "RefundObligation"; DROP TABLE "PaymentSubmission"; DROP TABLE "PaymentIntentAllocation"; DROP TABLE "PaymentIntent";
-- DROP TYPE "RefundObligationStatus"; DROP TYPE "PaymentSubmissionStatus"; DROP TYPE "PaymentIntentStatus";
-- Enum value ADVANCE cannot be removed without rebuilding "PaymentMethod".
