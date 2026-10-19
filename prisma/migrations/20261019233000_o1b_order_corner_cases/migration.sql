-- O1b: order corner cases
-- 1) replacement shop orders
-- 2) NOT_DELIVERED on delivered orders (seller flag counter)
-- 3) stuck-order cron bookkeeping
-- 4) cart price snapshots
-- 5) new notification types

CREATE TYPE "ShopOrderKind" AS ENUM ('ORDER', 'REPLACEMENT');

ALTER TABLE "ShopOrder" ADD COLUMN "kind" "ShopOrderKind" NOT NULL DEFAULT 'ORDER';
ALTER TABLE "ShopOrder" ADD COLUMN "parentShopOrderId" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "deliveryNote" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "delayNotifiedAt" TIMESTAMP(3);
ALTER TABLE "ShopOrder" ADD COLUMN "stuckReminderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ShopOrder" ADD COLUMN "stuckLastRemindedAt" TIMESTAMP(3);
ALTER TABLE "ShopOrder" ADD COLUMN "stuckFlaggedAt" TIMESTAMP(3);

ALTER TABLE "ShopOrder"
  ADD CONSTRAINT "ShopOrder_parentShopOrderId_fkey"
  FOREIGN KEY ("parentShopOrderId") REFERENCES "ShopOrder"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ShopOrder_parentShopOrderId_idx" ON "ShopOrder"("parentShopOrderId");
CREATE INDEX "ShopOrder_kind_status_idx" ON "ShopOrder"("kind", "status");
CREATE INDEX "ShopOrder_status_estimatedDeliveryTo_idx" ON "ShopOrder"("status", "estimatedDeliveryTo");

ALTER TABLE "SellerProfile" ADD COLUMN "falseDeliveryFlags" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "CartItem" ADD COLUMN "priceSnapshot" DECIMAL(12, 2);
UPDATE "CartItem" AS ci
SET "priceSnapshot" = v."price"
FROM "ProductVariant" AS v
WHERE ci."variantId" = v."id" AND ci."priceSnapshot" IS NULL;

ALTER TYPE "NotificationType" ADD VALUE 'ORDER_DELAYED';
ALTER TYPE "NotificationType" ADD VALUE 'ORDER_STUCK';
ALTER TYPE "NotificationType" ADD VALUE 'FALSE_DELIVERY_FLAG';
ALTER TYPE "NotificationType" ADD VALUE 'REPLACEMENT_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'ORDERS_BULK_CANCELLED';
