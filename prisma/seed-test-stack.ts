/**
 * Seeds the isolated Part 3 test stack database (planthaat_test only).
 *
 * Creates fake admin/buyers/sellers/shops/products and TEST-ONLY payment
 * settings (Advance ON, bKash/Nagad ON with fake numbers). Never run against
 * the dev database; refuses unless DATABASE_URL contains "test".
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import { hashPassword } from "../src/common/utils/password";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/prisma/prisma-client";

loadEnv({ path: resolve(".env.test"), override: true });

const DATABASE_URL = process.env.DATABASE_URL ?? "";
if (!/test/i.test(DATABASE_URL)) {
  throw new Error("Refusing to seed the test stack: DATABASE_URL does not contain 'test'");
}

const ADMIN = { email: "admin@teststack.local", password: "TestAdmin123!", name: "Test Admin" };
const BUYERS = [
  { email: "buyer1@teststack.local", password: "TestBuyer123!", name: "Test Buyer One" },
  { email: "buyer2@teststack.local", password: "TestBuyer123!", name: "Test Buyer Two" },
];
const SELLERS = [
  { email: "seller1@teststack.local", password: "TestSeller123!", name: "Test Seller One", shop: "Test Fern House" },
  { email: "seller2@teststack.local", password: "TestSeller123!", name: "Test Seller Two", shop: "Test Cactus Corner" },
  { email: "seller3@teststack.local", password: "TestSeller123!", name: "Test Seller Three", shop: "Test Herb Garden" },
];
const PRODUCTS = [
  { shop: 0, name: "Test Monstera", price: 1200 },
  { shop: 0, name: "Test Peace Lily", price: 650 },
  { shop: 1, name: "Test Golden Barrel", price: 900 },
  { shop: 1, name: "Test Echeveria", price: 350 },
  { shop: 2, name: "Test Basil Pot", price: 250 },
  { shop: 2, name: "Test Mint Pot", price: 220 },
];

const SETTINGS: Array<[string, Prisma.InputJsonValue]> = [
  ["payment.cod.enabled", true],
  ["payment.advance.enabled", true],
  ["payment.bkash.enabled", true],
  ["payment.bkash.number", "01700000000"],
  ["payment.nagad.enabled", true],
  ["payment.nagad.number", "01800000000"],
  ["payment.accountNote", "Personal account"],
  ["payment.instructions", "Send Money only; do not use Cash Out."],
  ["payment.warningText", "Send Money - not Cash Out. If you cash out, the money will not reach us."],
  ["payment.verificationText", "Verification usually takes a few hours."],
  ["payment.expiryHours", 12],
  ["payment.slaHours", 24],
  ["payment.lateGraceHours", 48],
  ["support.whatsapp", "01700000001"],
];

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function upsertUser(prisma: PrismaClient, email: string, name: string, role: "ADMIN" | "CUSTOMER" | "SELLER", password: string) {
  const passwordHash = await hashPassword(password);
  return prisma.user.upsert({
    where: { email },
    update: { name, role, emailVerifiedAt: new Date() },
    create: { email, name, passwordHash, role, emailVerifiedAt: new Date() },
  });
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    const district = await prisma.district.upsert({
      where: { name: "Dhaka" },
      update: {},
      create: { name: "Dhaka", nameBn: "ঢাকা", division: "Dhaka" },
    });
    const category = await prisma.category.upsert({
      where: { slug: "test-plants" },
      update: {},
      create: { name: "Test Plants", nameBn: "টেস্ট গাছ", slug: "test-plants", isActive: true },
    });

    await upsertUser(prisma, ADMIN.email, ADMIN.name, "ADMIN", ADMIN.password);
    for (const buyer of BUYERS) {
      const user = await upsertUser(prisma, buyer.email, buyer.name, "CUSTOMER", buyer.password);
      const address = await prisma.address.findFirst({ where: { userId: user.id } });
      if (!address) {
        await prisma.address.create({
          data: {
            userId: user.id,
            recipientName: buyer.name,
            phone: "01711111111",
            districtId: district.id,
            area: "Test Area",
            addressLine: "House 1, Test Road",
            isDefault: true,
          },
        });
      }
    }

    // Remove variants from an earlier seed that used non-UUID ids.
    await prisma.productVariant.deleteMany({ where: { id: { startsWith: "teststack-" } } });

    const shops: string[] = [];
    for (const [index, seller] of SELLERS.entries()) {
      const user = await upsertUser(prisma, seller.email, seller.name, "SELLER", seller.password);
      const profile = await prisma.sellerProfile.upsert({
        where: { userId: user.id },
        update: { status: "APPROVED", businessName: seller.shop },
        create: {
          userId: user.id,
          businessName: seller.shop,
          contactPhone: "01722222222",
          businessAddress: "Test Road",
          status: "APPROVED",
          verifiedAt: new Date(),
        },
      });
      const shopSlug = slugify(seller.shop);
      const shop = await prisma.shop.upsert({
        where: { slug: shopSlug },
        update: { status: "ACTIVE" },
        create: {
          sellerProfileId: profile.id,
          name: seller.shop,
          slug: shopSlug,
          status: "ACTIVE",
          approvedAt: new Date(),
          district: district.name,
        },
      });
      shops[index] = shop.id;
      const zone = await prisma.shopDeliveryZone.findFirst({ where: { shopId: shop.id } });
      if (!zone) {
        await prisma.shopDeliveryZone.create({
          data: {
            shopId: shop.id,
            name: "Nationwide test",
            charge: 60,
            districts: { create: [{ districtId: district.id }] },
          },
        });
      }
      for (const [productIndex, product] of PRODUCTS.filter((entry) => entry.shop === index).entries()) {
        const productSlug = slugify(product.name);
        const row = await prisma.product.upsert({
          where: { slug: productSlug },
          update: { status: "ACTIVE", inStock: true, minPrice: product.price, maxPrice: product.price },
          create: {
            shopId: shop.id,
            categoryId: category.id,
            name: product.name,
            slug: productSlug,
            description: "Test product for the isolated payment stack.",
            status: "ACTIVE",
            publishedAt: new Date(),
            inStock: true,
            minPrice: product.price,
            maxPrice: product.price,
          },
        });
        const variantId = `00000000-0000-4000-8000-0000000000${String(index * 10 + productIndex).padStart(2, "0")}`;
        await prisma.productVariant.upsert({
          where: { id: variantId },
          update: { price: product.price, stockQty: 25, isActive: true },
          create: {
            id: variantId,
            productId: row.id,
            name: "Standard",
            sku: `TESTSTACK-${index}-${productIndex}`,
            price: product.price,
            stockQty: 25,
            isActive: true,
          },
        });
      }
    }
    void shops;

    // Remove variants from an earlier seed that used non-UUID ids.
    await prisma.productVariant.deleteMany({ where: { id: { startsWith: "teststack-" } } });

    for (const [key, value] of SETTINGS) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
    console.log("Test stack seeded: admin, 2 buyers, 3 shops, 6 products, payment settings.");
    console.log("Advance ON; bKash 01700000000; Nagad 01800000000 (test-only).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
