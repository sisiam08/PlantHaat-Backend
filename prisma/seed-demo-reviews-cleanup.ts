import "dotenv/config";

import { createPrismaClient } from "../src/prisma/prisma-client";
import { recomputeReviewRatings } from "../src/modules/reviews/review-ratings";
import {
  DEMO_REVIEW_ID_PREFIX,
  DEMO_REVIEW_ORDER_PREFIX,
} from "./demo-reviews/shared";
import { requireDevDatabase, requireNonProduction } from "./demo-reviews/guards";

async function main(): Promise<void> {
  requireNonProduction("the demo-review cleanup");
  requireDevDatabase("the demo-review cleanup");

  const prisma = createPrismaClient();
  try {
    const reviews = await prisma.review.findMany({
      where: { id: { startsWith: DEMO_REVIEW_ID_PREFIX } },
      select: { id: true, productId: true, shopId: true },
    });

    if (reviews.length === 0) {
      console.log("No demo reviews found; nothing to clean up.");
    } else {
      const pairs = new Map<string, { productId: string; shopId: string }>();
      for (const review of reviews) {
        pairs.set(`${review.productId}:${review.shopId}`, {
          productId: review.productId,
          shopId: review.shopId,
        });
      }
      await prisma.$transaction(async (tx) => {
        await tx.review.deleteMany({ where: { id: { startsWith: DEMO_REVIEW_ID_PREFIX } } });
        for (const pair of pairs.values()) {
          await recomputeReviewRatings(tx, pair.productId, pair.shopId);
        }
      });
      console.log(`Deleted ${reviews.length} demo reviews and recomputed ratings.`);
    }

    const orders = await prisma.order.deleteMany({
      where: { orderNumber: { startsWith: DEMO_REVIEW_ORDER_PREFIX } },
    });
    console.log(`Deleted ${orders.count} demo marker orders (items, payments included).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
