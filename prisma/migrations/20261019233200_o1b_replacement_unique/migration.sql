-- At most one replacement per parent shop order (nullable allows many NULLs).

DROP INDEX "ShopOrder_parentShopOrderId_idx";
CREATE UNIQUE INDEX "ShopOrder_parentShopOrderId_key" ON "ShopOrder"("parentShopOrderId");
