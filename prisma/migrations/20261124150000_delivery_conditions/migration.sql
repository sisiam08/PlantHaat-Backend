-- Additive nationwide delivery conditions. Existing zone rows stay for legacy
-- fallback/history; new sellers write condition rows through the same table.
CREATE TYPE "DeliveryCondition" AS ENUM ('INSIDE_DHAKA', 'OUTSIDE_DHAKA');
CREATE TYPE "DeliveryPaymentMode" AS ENUM ('COD_AND_ADVANCE', 'COD_ONLY', 'ADVANCE_ONLY');

ALTER TABLE "District" ADD COLUMN "insideDhaka" BOOLEAN NOT NULL DEFAULT false;
UPDATE "District" SET "insideDhaka" = true WHERE lower("name") = 'dhaka';

ALTER TABLE "ShopDeliveryZone" ADD COLUMN "condition" "DeliveryCondition";
ALTER TABLE "ShopDeliveryZone" ADD COLUMN "paymentMode" "DeliveryPaymentMode" NOT NULL DEFAULT 'COD_AND_ADVANCE';

CREATE UNIQUE INDEX "ShopDeliveryZone_shopId_condition_key" ON "ShopDeliveryZone"("shopId", "condition");
