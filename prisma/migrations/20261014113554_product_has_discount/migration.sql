-- AlterTable: denormalized "on sale" flag, maintained with minPrice/maxPrice/inStock
ALTER TABLE "Product" ADD COLUMN     "hasDiscount" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Product_status_hasDiscount_idx" ON "Product"("status", "hasDiscount");

-- Backfill: a product is on sale when any active variant has compareAtPrice > price.
UPDATE "Product" p
SET "hasDiscount" = EXISTS (
  SELECT 1
  FROM "ProductVariant" v
  WHERE v."productId" = p."id"
    AND v."isActive" = true
    AND v."compareAtPrice" IS NOT NULL
    AND v."compareAtPrice" > v."price"
);
