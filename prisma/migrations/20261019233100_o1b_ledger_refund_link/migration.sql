-- O1b follow-up: link ledger reversals to their refund so a refund resolved
-- from a complaint is reversed exactly once (resolve + process are idempotent).

ALTER TABLE "LedgerEntry" ADD COLUMN "refundId" TEXT;
ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "Refund"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "LedgerEntry_refundId_idx" ON "LedgerEntry"("refundId");
