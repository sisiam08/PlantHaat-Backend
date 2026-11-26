/**
 * Marker-tagged demo identities/data for the existing browser suites
 * (header-nav, access-control, session, auth-redirect, design-conformance,
 * performance). Test database only; idempotent; safe to re-run.
 *
 * Run through `scripts/test-stack.ps1 start` (after db:seed:test-stack) or:
 *   node scripts/db-test-guard.mjs && tsx scripts/seed-e2e-demo.ts
 * Cleanup:
 *   node scripts/db-test-guard.mjs && tsx scripts/seed-e2e-demo-cleanup.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import { hashPassword } from "../src/common/utils/password";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { Role } from "../src/generated/prisma/enums";
import { createPrismaClient } from "../src/prisma/prisma-client";

loadEnv({ path: resolve(".env.test"), override: true });
const DATABASE_URL = process.env.DATABASE_URL ?? "";
if (!/test/i.test(DATABASE_URL)) {
  throw new Error("Refusing to seed e2e demo data: DATABASE_URL does not contain 'test'");
}

const MARKER = "[seed:e2e-demo]";
const ADMIN = { email: "admin@planthaat.local", password: "E2eAdmin123!", name: "E2E Admin" };
const CUSTOMER = { email: "customer1@planthaat.test", password: "CustomerDemo1", name: "E2E Customer" };
const SELLER = { email: "seller1@planthaat.test", password: "SellerDemo1", name: "E2E Seller" };
const SHOP_SLUG = "demo-nursery";
const PRODUCT_SLUG = "money-tree-bonsai-xokk";
const VARIANT_ID = "00000000-0000-4000-8000-00000000e2e1";

async function upsertUser(
  prisma: PrismaClient,
  user: { email: string; password: string; name: string },
  role: Role,
) {
  const passwordHash = await hashPassword(user.password);
  return prisma.user.upsert({
    where: { email: user.email },
    update: { name: user.name, role, status: "ACTIVE", emailVerifiedAt: new Date() },
    create: {
      email: user.email,
      name: user.name,
      passwordHash,
      role,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
}

async function main() {
  const prisma = createPrismaClient();
  try {
    const district = await prisma.district.upsert({
      where: { name: "Dhaka" },
      update: {},
      create: { name: "Dhaka", nameBn: "ঢাকা", division: "Dhaka" },
    });
    const category = await prisma.category.upsert({
      where: { slug: "demo-plants" },
      update: { isActive: true },
      create: {
        name: "Demo Plants",
        nameBn: "ডেমো গাছ",
        slug: "demo-plants",
        isActive: true,
      },
    });

    await upsertUser(prisma, ADMIN, "ADMIN");
    const customer = await upsertUser(prisma, CUSTOMER, "CUSTOMER");
    const seller = await upsertUser(prisma, SELLER, "SELLER");

    const address = await prisma.address.findFirst({ where: { userId: customer.id } });
    if (!address) {
      await prisma.address.create({
        data: {
          userId: customer.id,
          recipientName: CUSTOMER.name,
          phone: "01712345678",
          districtId: district.id,
          area: "Dhanmondi",
          addressLine: "House 1, Road 5",
          isDefault: true,
        },
      });
    }

    const profile = await prisma.sellerProfile.upsert({
      where: { userId: seller.id },
      update: { status: "APPROVED", businessName: `Demo Nursery ${MARKER}` },
      create: {
        userId: seller.id,
        businessName: `Demo Nursery ${MARKER}`,
        contactPhone: "01722222222",
        businessAddress: "Demo Road, Dhaka",
        status: "APPROVED",
        verifiedAt: new Date(),
      },
    });
    const shop = await prisma.shop.upsert({
      where: { slug: SHOP_SLUG },
      update: { status: "ACTIVE", isOnVacation: false },
      create: {
        sellerProfileId: profile.id,
        name: "Demo Nursery",
        slug: SHOP_SLUG,
        description: `Demo storefront ${MARKER}`,
        status: "ACTIVE",
        approvedAt: new Date(),
        district: district.name,
      },
    });
    const zone = await prisma.shopDeliveryZone.findFirst({ where: { shopId: shop.id } });
    if (!zone) {
      await prisma.shopDeliveryZone.create({
        data: {
          shopId: shop.id,
          name: "Nationwide demo",
          charge: 60,
          districts: { create: [{ districtId: district.id }] },
        },
      });
    }

    const product = await prisma.product.upsert({
      where: { slug: PRODUCT_SLUG },
      update: {
        shopId: shop.id,
        categoryId: category.id,
        status: "ACTIVE",
        inStock: true,
        minPrice: 1200,
        maxPrice: 1200,
      },
      create: {
        shopId: shop.id,
        categoryId: category.id,
        name: "Money Tree Bonsai",
        nameBn: "মানি ট্রি বনসাই",
        slug: PRODUCT_SLUG,
        description: `A demo money tree for the isolated browser suites. ${MARKER}`,
        status: "ACTIVE",
        publishedAt: new Date(),
        inStock: true,
        minPrice: 1200,
        maxPrice: 1200,
        tags: [],
      },
    });
    await prisma.productVariant.upsert({
      where: { id: VARIANT_ID },
      update: { productId: product.id, price: 1200, stockQty: 25, isActive: true },
      create: {
        id: VARIANT_ID,
        productId: product.id,
        name: "Standard",
        sku: "E2E-DEMO-001",
        price: 1200,
        stockQty: 25,
        isActive: true,
      },
    });
    const image = await prisma.productImage.findFirst({ where: { productId: product.id } });
    if (!image) {
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: "/placeholders/plant-placeholder.webp",
          altText: "Money Tree Bonsai",
          sortOrder: 0,
          isPrimary: true,
        },
      });
    }

    const cart = await prisma.cart.upsert({
      where: { userId: customer.id },
      update: {},
      create: { userId: customer.id },
    });
    await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: VARIANT_ID } },
      update: { quantity: 1 },
      create: { cartId: cart.id, variantId: VARIANT_ID, quantity: 1, priceSnapshot: 1200 },
    });

    console.log(
      `E2E demo seeded ${MARKER}: admin@planthaat.local, customer1, seller1, ${SHOP_SLUG}, ${PRODUCT_SLUG}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
