/**
 * Removes exactly the synthetic dashboard dataset created by
 * `seed-dashboard-kit.ts` from the isolated planthaat_test database.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import { createPrismaClient } from "../src/prisma/prisma-client";

loadEnv({ path: resolve(".env.test"), override: true });

const DATABASE_URL = process.env.DATABASE_URL ?? "";
if (!/planthaat_test/i.test(DATABASE_URL)) {
  throw new Error("Refusing to clean up: .env.test is not the planthaat_test database");
}

const MARK = "DASHKIT";
const SELLER_EMAIL = "dashboard-demo-seller@planthaat.test";
const CUSTOMER_EMAIL = "dashboard-demo-customer@planthaat.test";
const SHOP_SLUG = "dashboard-kit-demo-nursery";
const CATEGORY_SLUG = "dashboard-kit-demo";
const PRODUCT_SLUGS = [
  "dashboard-kit-monstera",
  "dashboard-kit-peace-lily",
  "dashboard-kit-snake-plant",
  "dashboard-kit-areca-palm",
  "dashboard-kit-echeveria",
];

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const shop = await prisma.shop.findUnique({ where: { slug: SHOP_SLUG } });
    if (!shop) {
      console.log(`[${MARK}] no demo shop found; nothing to clean up.`);
      return;
    }
    const orders = await prisma.order.findMany({
      where: { orderNumber: { startsWith: `${MARK}-` } },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);
    const shopOrders = await prisma.shopOrder.findMany({
      where: { OR: [{ shopId: shop.id }, { orderId: { in: orderIds } }] },
      select: { id: true },
    });
    const shopOrderIds = shopOrders.map((row) => row.id);
    const intents = await prisma.paymentIntent.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true },
    });
    const intentIds = intents.map((intent) => intent.id);
    const products = await prisma.product.findMany({
      where: { shopId: shop.id, slug: { in: PRODUCT_SLUGS } },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.review.deleteMany({ where: { shopId: shop.id } });
      await tx.complaint.deleteMany({ where: { ticketNumber: { startsWith: `${MARK}-` } } });
      await tx.refund.deleteMany({ where: { shopOrderId: { in: shopOrderIds } } });
      await tx.ledgerEntry.deleteMany({ where: { idempotencyKey: { startsWith: `${MARK}-` } } });
      await tx.payout.deleteMany({ where: { payoutNumber: { startsWith: `${MARK}-` } } });
      await tx.paymentSubmission.deleteMany({ where: { intentId: { in: intentIds } } });
      await tx.refundObligation.deleteMany({ where: { intentId: { in: intentIds } } });
      await tx.paymentIntent.deleteMany({ where: { id: { in: intentIds } } });
      await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.orderItem.deleteMany({ where: { shopOrderId: { in: shopOrderIds } } });
      await tx.orderStatusHistory.deleteMany({ where: { shopOrderId: { in: shopOrderIds } } });
      await tx.cancellationRequest.deleteMany({ where: { shopOrderId: { in: shopOrderIds } } });
      await tx.shopOrder.deleteMany({ where: { id: { in: shopOrderIds } } });
      await tx.order.deleteMany({ where: { id: { in: orderIds } } });
      await tx.product.deleteMany({ where: { id: { in: products.map((row) => row.id) } } });
      await tx.shop.delete({ where: { id: shop.id } });
    });

    // Profile/users/category are only removed when no other rows reference them.
    const seller = await prisma.user.findUnique({ where: { email: SELLER_EMAIL } });
    if (seller) {
      const profile = await prisma.sellerProfile.findUnique({ where: { userId: seller.id } });
      if (profile) {
        const remainingShops = await prisma.shop.count({ where: { sellerProfileId: profile.id } });
        if (remainingShops === 0) await prisma.sellerProfile.delete({ where: { id: profile.id } });
      }
      const remainingSellerOrders = await prisma.order.count({ where: { customerId: seller.id } });
      if (remainingSellerOrders === 0) await prisma.user.delete({ where: { id: seller.id } });
    }
    const customer = await prisma.user.findUnique({ where: { email: CUSTOMER_EMAIL } });
    if (customer) {
      const remaining = await prisma.order.count({ where: { customerId: customer.id } });
      const remainingReviews = await prisma.review.count({ where: { customerId: customer.id } });
      if (remaining === 0 && remainingReviews === 0) {
        await prisma.user.delete({ where: { id: customer.id } });
      }
    }
    const category = await prisma.category.findUnique({ where: { slug: CATEGORY_SLUG } });
    if (category) {
      const remaining = await prisma.product.count({ where: { categoryId: category.id } });
      if (remaining === 0) await prisma.category.delete({ where: { id: category.id } });
    }

    console.log(
      `[${MARK}] removed orders=${orderIds.length} shopOrders=${shopOrderIds.length} intents=${intentIds.length}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
