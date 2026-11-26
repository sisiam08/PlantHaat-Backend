/**
 * Removes the marker-tagged e2e demo identities/data from planthaat_test.
 * Test database only; best-effort (test-created orders may still reference the
 * demo product/shop, in which case those rows are left intact and reported).
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import { createPrismaClient } from "../src/prisma/prisma-client";

loadEnv({ path: resolve(".env.test"), override: true });
const DATABASE_URL = process.env.DATABASE_URL ?? "";
if (!/test/i.test(DATABASE_URL)) {
  throw new Error("Refusing to clean e2e demo data: DATABASE_URL does not contain 'test'");
}

const MARKER = "[seed:e2e-demo]";
const EMAILS = ["admin@planthaat.local", "customer1@planthaat.test", "seller1@planthaat.test"];
const SHOP_SLUG = "demo-nursery";
const PRODUCT_SLUG = "money-tree-bonsai-xokk";

async function main() {
  const prisma = createPrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { email: { in: EMAILS } },
      select: { id: true, email: true },
    });
    for (const user of users) {
      if (user.email === "customer1@planthaat.test") {
        const cart = await prisma.cart.findUnique({ where: { userId: user.id } });
        if (cart) {
          await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
          await prisma.cart.delete({ where: { id: cart.id } });
        }
        await prisma.address.deleteMany({ where: { userId: user.id } });
      }
    }
    const product = await prisma.product.findUnique({ where: { slug: PRODUCT_SLUG } });
    if (product) {
      await prisma.productImage.deleteMany({ where: { productId: product.id } });
      await prisma.productVariant.deleteMany({ where: { productId: product.id } });
      await prisma.product.delete({ where: { id: product.id } }).catch(() => {
        console.log("Demo product still referenced by test orders; left intact.");
      });
    }
    const shop = await prisma.shop.findUnique({ where: { slug: SHOP_SLUG } });
    if (shop) {
      await prisma.shopDeliveryZone.deleteMany({ where: { shopId: shop.id } });
      await prisma.shop.delete({ where: { id: shop.id } }).catch(() => {
        console.log("Demo shop still referenced by test orders; left intact.");
      });
    }
    const seller = users.find((user) => user.email === "seller1@planthaat.test");
    if (seller) {
      await prisma.sellerProfile.deleteMany({ where: { userId: seller.id } });
    }
    for (const email of EMAILS) {
      await prisma.user.deleteMany({ where: { email } });
    }
    console.log(`E2E demo cleanup complete ${MARKER}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
