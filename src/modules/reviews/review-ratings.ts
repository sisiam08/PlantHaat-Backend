import type { Prisma } from "../../generated/prisma/client";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Recomputes Product/Shop rating aggregates from VISIBLE reviews (same tx). */
export async function recomputeReviewRatings(
  tx: Prisma.TransactionClient,
  productId: string,
  shopId: string,
): Promise<void> {
  const productAgg = await tx.review.aggregate({
    where: { productId, status: "VISIBLE" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.product.update({
    where: { id: productId },
    data: {
      ratingAvg: round2(productAgg._avg.rating ?? 0),
      ratingCount: productAgg._count._all,
    },
  });

  const shopAgg = await tx.review.aggregate({
    where: { shopId, status: "VISIBLE" },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.shop.update({
    where: { id: shopId },
    data: {
      ratingAvg: round2(shopAgg._avg.rating ?? 0),
      ratingCount: shopAgg._count._all,
    },
  });
}
