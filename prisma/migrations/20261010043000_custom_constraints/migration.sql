-- Hand-written SQL that the Prisma schema language cannot express (design §6).

-- ── Search support: trigram indexes for Product text search (ILIKE fallback) ──
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Product_name_trgm_idx"
  ON "Product" USING GIN ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_nameBn_trgm_idx"
  ON "Product" USING GIN ("nameBn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Product_scientificName_trgm_idx"
  ON "Product" USING GIN ("scientificName" gin_trgm_ops);

-- ── CHECK constraints ──
ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_stockQty_nonnegative" CHECK ("stockQty" >= 0);
ALTER TABLE "ProductVariant"
  ADD CONSTRAINT "ProductVariant_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "CartItem"
  ADD CONSTRAINT "CartItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- ── Partial unique indexes ──
-- One default address per user.
CREATE UNIQUE INDEX IF NOT EXISTS "Address_user_default_unique"
  ON "Address" ("userId") WHERE "isDefault";
-- One pending cancellation request per shop order.
CREATE UNIQUE INDEX IF NOT EXISTS "CancellationRequest_pending_shop_order_unique"
  ON "CancellationRequest" ("shopOrderId") WHERE "status" = 'PENDING';
