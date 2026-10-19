-- Task O1a: payout hold. Positive ledger entries unlock after the payout hold
-- window past delivery; negative entries (COD commission due, payouts, dues)
-- stay immediately effective (availableAt = NULL).
ALTER TABLE "LedgerEntry" ADD COLUMN "availableAt" TIMESTAMP(3);

-- Backfill positive entries tied to a delivered shop order using the default
-- 48 h hold (complaint window). Runtime uses payout.holdHours.
UPDATE "LedgerEntry" le
SET "availableAt" = so."deliveredAt" + interval '48 hours'
FROM "ShopOrder" so
WHERE le."shopOrderId" = so."id"
  AND le."amount" > 0
  AND so."deliveredAt" IS NOT NULL;

-- Positive entries without a delivery timestamp (adjustments/credits).
UPDATE "LedgerEntry"
SET "availableAt" = "createdAt" + interval '48 hours'
WHERE "amount" > 0
  AND "availableAt" IS NULL;

CREATE INDEX "LedgerEntry_sellerProfileId_availableAt_idx"
  ON "LedgerEntry"("sellerProfileId", "availableAt");
