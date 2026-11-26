/**
 * Seeds the isolated delivery-quote fixtures (planthaat_test only).
 *
 * Live quotes are OFF. A Dhaka City override and an outside-Dhaka fallback are
 * provided so browser checks never call the real Steadfast endpoint.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/prisma/prisma-client";

loadEnv({ path: resolve(".env.test"), override: true });

const DATABASE_URL = process.env.DATABASE_URL ?? "";
if (!/test/i.test(DATABASE_URL)) {
  throw new Error("Refusing to seed delivery fixtures: DATABASE_URL does not contain 'test'");
}

const MIRPUR_ID = 900001;
const SAVAR_ID = 900002;

async function ensureLocation(
  prisma: PrismaClient,
  id: number,
  name: string,
  kind: "DHAKA_CITY" | "DHAKA_SUBURBAN" | "DISTRICT",
) {
  await prisma.steadfastLocation.upsert({
    where: { id },
    update: { name, kind },
    create: { id, name, kind },
  });
}

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    await ensureLocation(prisma, 1, "Dhaka City", "DHAKA_CITY");
    await ensureLocation(prisma, 18, "Dhaka Sub-Urban", "DHAKA_SUBURBAN");
    await ensureLocation(prisma, 2, "Chittagong", "DISTRICT");

    const district = await prisma.district.upsert({
      where: { name: "Dhaka" },
      update: { steadfastLocationId: null, nameBn: "ঢাকা", insideDhaka: true },
      create: { name: "Dhaka", nameBn: "ঢাকা", division: "Dhaka", insideDhaka: true },
    });

    const mirpur = await prisma.thana.upsert({
      where: { steadfastPoliceStationId: MIRPUR_ID },
      update: {
        name: "Mirpur",
        districtId: district.id,
        dhakaZone: "CITY",
        selectableByCustomer: true,
      },
      create: {
        steadfastPoliceStationId: MIRPUR_ID,
        name: "Mirpur",
        districtId: district.id,
        dhakaZone: "CITY",
        selectableByCustomer: true,
      },
    });
    await prisma.thana.upsert({
      where: { steadfastPoliceStationId: 900003 },
      update: {
        name: "Zone Not Clear",
        districtId: district.id,
        dhakaZone: "CITY",
        selectableByCustomer: false,
      },
      create: {
        steadfastPoliceStationId: 900003,
        name: "Zone Not Clear",
        districtId: district.id,
        dhakaZone: "CITY",
        selectableByCustomer: false,
      },
    });

    const savar = await prisma.thana.upsert({
      where: { steadfastPoliceStationId: SAVAR_ID },
      update: {
        name: "Savar",
        districtId: district.id,
        dhakaZone: "SUBURBAN",
        selectableByCustomer: true,
      },
      create: {
        steadfastPoliceStationId: SAVAR_ID,
        name: "Savar",
        districtId: district.id,
        dhakaZone: "SUBURBAN",
        selectableByCustomer: true,
      },
    });
    void savar;

    await prisma.shop.updateMany({
      where: { district: "Dhaka" },
      data: { pickupDistrictId: district.id, pickupThanaId: mirpur.id },
    });
    await prisma.address.updateMany({
      where: { districtId: district.id, thanaId: null },
      data: { thanaId: mirpur.id },
    });
    // Buyer two keeps a legacy Dhaka address with no thana for the prompt check.
    const buyerTwo = await prisma.user.findUnique({
      where: { email: "buyer2@teststack.local" },
      select: { id: true },
    });
    if (buyerTwo) {
      await prisma.address.updateMany({
        where: { userId: buyerTwo.id },
        data: { thanaId: null },
      });
    }

    // A second pickup district so the cart can group two shops with different origins.
    const sylhet = await prisma.district.upsert({
      where: { name: "Sylhet" },
      update: { steadfastLocationId: 2 },
      create: { name: "Sylhet", nameBn: "সিলেট", division: "Sylhet", steadfastLocationId: 2 },
    });
    const sellerThree = await prisma.sellerProfile.findFirst({
      where: { user: { email: "seller3@teststack.local" } },
      select: { id: true },
    });
    if (sellerThree) {
      const sylhetShop = await prisma.shop.upsert({
        where: { slug: "test-sylhet-ferns" },
        update: {
          status: "ACTIVE",
          pickupDistrictId: sylhet.id,
          district: "Sylhet",
        },
        create: {
          sellerProfileId: sellerThree.id,
          name: "Test Sylhet Ferns",
          slug: "test-sylhet-ferns",
          status: "ACTIVE",
          approvedAt: new Date(),
          district: "Sylhet",
          pickupDistrictId: sylhet.id,
        },
      });
      const zone = await prisma.shopDeliveryZone.findFirst({
        where: { shopId: sylhetShop.id },
      });
      if (!zone) {
        await prisma.shopDeliveryZone.create({
          data: {
            shopId: sylhetShop.id,
            name: "Sylhet test",
            charge: 60,
            districts: { create: [{ districtId: sylhet.id }] },
          },
        });
      }
      const category = await prisma.category.findFirst({
        where: { slug: "test-plants" },
        select: { id: true },
      });
      if (category) {
        const sylhetProduct = await prisma.product.upsert({
          where: { slug: "test-sylhet-plant" },
          update: {
            status: "ACTIVE",
            inStock: true,
            minPrice: new Prisma.Decimal(700),
            maxPrice: new Prisma.Decimal(700),
          },
          create: {
            shopId: sylhetShop.id,
            categoryId: category.id,
            name: "Test Sylhet Plant",
            slug: "test-sylhet-plant",
            description: "Second-pickup test product.",
            status: "ACTIVE",
            publishedAt: new Date(),
            inStock: true,
            minPrice: new Prisma.Decimal(700),
            maxPrice: new Prisma.Decimal(700),
          },
        });
        await prisma.productVariant.upsert({
          where: { id: "00000000-0000-4000-8000-000000000099" },
          update: { price: new Prisma.Decimal(700), stockQty: 25, isActive: true },
          create: {
            id: "00000000-0000-4000-8000-000000000099",
            productId: sylhetProduct.id,
            name: "Standard",
            sku: "TESTSTACK-SYLHET",
            price: new Prisma.Decimal(700),
            stockQty: 25,
            isActive: true,
          },
        });
      }
    }

    const settings: Array<[string, Prisma.InputJsonValue]> = [
      ["delivery.quote.live.enabled", false],
      ["delivery.fallback.insideDhaka", 60],
      ["delivery.fallback.outsideDhaka", 90],
      ["delivery.quote.cacheFreshHours", 24],
      ["delivery.quote.staleDays", 30],
    ];
    for (const [key, value] of settings) {
      await prisma.systemSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }

    // Override rows win over fallback (and are never auto-refreshed).
    await prisma.courierQuoteCache.upsert({
      where: {
        fromSteadfastId_toSteadfastId_weightStep: {
          fromSteadfastId: 1,
          toSteadfastId: 1,
          weightStep: new Prisma.Decimal(0.5),
        },
      },
      update: {
        charge: new Prisma.Decimal(55),
        available: true,
        lane: "inside_dhaka",
        source: "ADMIN",
        isOverride: true,
        fetchedAt: new Date(),
      },
      create: {
        fromSteadfastId: 1,
        toSteadfastId: 1,
        weightStep: new Prisma.Decimal(0.5),
        charge: new Prisma.Decimal(55),
        available: true,
        lane: "inside_dhaka",
        source: "ADMIN",
        isOverride: true,
      },
    });
    await prisma.courierQuoteCache.upsert({
      where: {
        fromSteadfastId_toSteadfastId_weightStep: {
          fromSteadfastId: 1,
          toSteadfastId: 18,
          weightStep: new Prisma.Decimal(0.5),
        },
      },
      update: {
        charge: new Prisma.Decimal(95),
        available: true,
        lane: "outside_dhaka",
        source: "ADMIN",
        isOverride: true,
        fetchedAt: new Date(),
      },
      create: {
        fromSteadfastId: 1,
        toSteadfastId: 18,
        weightStep: new Prisma.Decimal(0.5),
        charge: new Prisma.Decimal(95),
        available: true,
        lane: "outside_dhaka",
        source: "ADMIN",
        isOverride: true,
      },
    });

    // Some weight/extra data for the UI examples.
    await prisma.product.updateMany({
      where: { slug: "test-monstera" },
      data: {
        weightKg: new Prisma.Decimal(1.2),
        extraChargeAfterQty: 2,
        extraChargePerUnit: new Prisma.Decimal(10),
      },
    });

    console.log("Delivery fixtures seeded: live OFF, override 1→1 = 55, fallback outside = 90.");
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});


