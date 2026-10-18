import type { Prisma, PrismaClient } from "../../generated/prisma/client";

export type DbClient = Prisma.TransactionClient | PrismaClient;

/**
 * Recomputes the denormalized `minPrice`, `maxPrice`, `inStock` and
 * `hasDiscount` fields from the product's active variants. Must run in the same
 * transaction as any variant/stock change.
 */
export async function recomputeProductAggregates(
  client: DbClient,
  productId: string,
): Promise<void> {
  const variants = await client.productVariant.findMany({
    where: { productId, isActive: true },
    select: { price: true, stockQty: true, compareAtPrice: true },
  });

  if (variants.length === 0) {
    await client.product.update({
      where: { id: productId },
      data: { minPrice: null, maxPrice: null, inStock: false, hasDiscount: false },
    });
    return;
  }

  let min = variants[0].price;
  let max = variants[0].price;
  let inStock = false;
  let hasDiscount = false;
  for (const variant of variants) {
    if (variant.price.lessThan(min)) {
      min = variant.price;
    }
    if (variant.price.greaterThan(max)) {
      max = variant.price;
    }
    if (variant.stockQty > 0) {
      inStock = true;
    }
    if (variant.compareAtPrice && variant.compareAtPrice.greaterThan(variant.price)) {
      hasDiscount = true;
    }
  }

  await client.product.update({
    where: { id: productId },
    data: { minPrice: min, maxPrice: max, inStock, hasDiscount },
  });
}
