import "dotenv/config";

import argon2 from "argon2";

import { generateOrderNumber } from "../src/common/utils/order-number";
import { toUniqueSlug } from "../src/common/utils/slug";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/prisma/prisma-client";
import { DISTRICTS } from "./data/bd-districts";
import { DEFAULT_CATEGORIES } from "./data/categories";

const SELLER_PASSWORD = "SellerDemo1";
const CUSTOMER_PASSWORD = "CustomerDemo1";

const PRODUCT_NAMES: { name: string; categorySlug: string; price: number }[] = [
  { name: "Monstera Deliciosa", categorySlug: "indoor-plants", price: 850 },
  { name: "Snake Plant", categorySlug: "indoor-plants", price: 550 },
  { name: "Peace Lily", categorySlug: "indoor-plants", price: 620 },
  { name: "ZZ Plant", categorySlug: "indoor-plants", price: 700 },
  { name: "Fiddle Leaf Fig", categorySlug: "indoor-plants", price: 1400 },
  { name: "Rubber Plant", categorySlug: "indoor-plants", price: 780 },
  { name: "Areca Palm", categorySlug: "indoor-plants", price: 900 },
  { name: "Money Plant", categorySlug: "indoor-plants", price: 300 },
  { name: "Rose", categorySlug: "flowering-plants", price: 350 },
  { name: "Jasmine", categorySlug: "flowering-plants", price: 400 },
  { name: "Hibiscus", categorySlug: "flowering-plants", price: 450 },
  { name: "Bougainvillea", categorySlug: "flowering-plants", price: 500 },
  { name: "Marigold", categorySlug: "flowering-plants", price: 150 },
  { name: "Orchid", categorySlug: "flowering-plants", price: 1200 },
  { name: "Mango (Grafted)", categorySlug: "fruit-plants", price: 650 },
  { name: "Guava", categorySlug: "fruit-plants", price: 450 },
  { name: "Lemon", categorySlug: "fruit-plants", price: 500 },
  { name: "Lychee", categorySlug: "fruit-plants", price: 900 },
  { name: "Papaya", categorySlug: "fruit-plants", price: 250 },
  { name: "Banana", categorySlug: "fruit-plants", price: 300 },
  { name: "Tulsi", categorySlug: "herbs-medicinal", price: 200 },
  { name: "Mint", categorySlug: "herbs-medicinal", price: 120 },
  { name: "Aloe Vera", categorySlug: "herbs-medicinal", price: 250 },
  { name: "Curry Leaf", categorySlug: "herbs-medicinal", price: 220 },
  { name: "Lemongrass", categorySlug: "herbs-medicinal", price: 150 },
  { name: "Echeveria", categorySlug: "succulents-cactus", price: 320 },
  { name: "Haworthia", categorySlug: "succulents-cactus", price: 280 },
  { name: "Jade Plant", categorySlug: "succulents-cactus", price: 400 },
  { name: "Barrel Cactus", categorySlug: "succulents-cactus", price: 550 },
  { name: "Ficus Bonsai", categorySlug: "bonsai", price: 2500 },
  { name: "Juniper Bonsai", categorySlug: "bonsai", price: 3200 },
  { name: "Basil Seeds", categorySlug: "seeds", price: 80 },
  { name: "Tomato Seeds", categorySlug: "seeds", price: 60 },
  { name: "Sunflower Seeds", categorySlug: "seeds", price: 90 },
  { name: "Terracotta Pot 8in", categorySlug: "pots-planters", price: 220 },
  { name: "Ceramic Planter", categorySlug: "pots-planters", price: 650 },
  { name: "Hanging Basket", categorySlug: "pots-planters", price: 350 },
  { name: "Organic Compost 5kg", categorySlug: "soil-fertilizer", price: 180 },
  { name: "Vermicompost 2kg", categorySlug: "soil-fertilizer", price: 150 },
  { name: "Pruning Shears", categorySlug: "gardening-tools", price: 450 },
];

const DEMO_SELLERS = [
  { name: "Rahim Nursery", email: "seller1@planthaat.test", district: "Dhaka" },
  { name: "Chattogram Green House", email: "seller2@planthaat.test", district: "Chattogram" },
  { name: "Sylhet Plant Hub", email: "seller3@planthaat.test", district: "Sylhet" },
];

const DEMO_CUSTOMERS = [
  "customer1@planthaat.test",
  "customer2@planthaat.test",
  "customer3@planthaat.test",
  "customer4@planthaat.test",
  "customer5@planthaat.test",
];

function requireNonProduction(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run the demo seed with NODE_ENV=production");
  }
}

async function ensureReferenceData(prisma: PrismaClient): Promise<void> {
  for (const district of DISTRICTS) {
    await prisma.district.upsert({
      where: { name: district.name },
      update: {},
      create: district,
    });
  }
  for (const [index, category] of DEFAULT_CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: { ...category, sortOrder: index },
    });
  }
}

async function seedSellers(prisma: PrismaClient, sellerProfileIds: string[]) {
  const passwordHash = await argon2.hash(SELLER_PASSWORD, { type: argon2.argon2id });
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  const productsPerSeller = Math.ceil(PRODUCT_NAMES.length / DEMO_SELLERS.length);

  for (const [sellerIndex, seller] of DEMO_SELLERS.entries()) {
    const user = await prisma.user.upsert({
      where: { email: seller.email },
      update: {},
      create: {
        email: seller.email,
        name: seller.name,
        passwordHash,
        role: "SELLER",
        emailVerifiedAt: new Date(),
      },
    });

    const profile = await prisma.sellerProfile.upsert({
      where: { userId: user.id },
      update: { status: "APPROVED" },
      create: {
        userId: user.id,
        businessName: seller.name,
        contactPhone: "01712345678",
        businessAddress: `${seller.district}, Bangladesh`,
        status: "APPROVED",
        verifiedAt: new Date(),
      },
    });
    sellerProfileIds.push(profile.id);

    const shop = await prisma.shop.upsert({
      where: { slug: toUniqueSlug(seller.name) },
      update: { status: "ACTIVE" },
      create: {
        sellerProfileId: profile.id,
        name: seller.name,
        slug: toUniqueSlug(seller.name),
        description: `${seller.name} — verified PlantHaat seller.`,
        district: seller.district,
        status: "ACTIVE",
        approvedAt: new Date(),
      },
    });

    const zoneCount = await prisma.shopDeliveryZone.count({ where: { shopId: shop.id } });
    if (zoneCount === 0) {
      await prisma.shopDeliveryZone.create({
        data: {
          shopId: shop.id,
          name: "Nationwide",
          isNationwide: true,
          charge: 80,
          freeDeliveryAbove: 1500,
        },
      });
    }

    const existingProducts = await prisma.product.count({ where: { shopId: shop.id } });
    if (existingProducts > 0) {
      continue;
    }

    const slice = PRODUCT_NAMES.slice(
      sellerIndex * productsPerSeller,
      (sellerIndex + 1) * productsPerSeller,
    );

    for (const item of slice) {
      const categoryId = categoryBySlug.get(item.categorySlug);
      if (!categoryId) continue;
      const slug = toUniqueSlug(item.name);
      const product = await prisma.product.create({
        data: {
          shopId: shop.id,
          categoryId,
          name: item.name,
          slug,
          description: `${item.name} — healthy, nursery-grown plant.`,
          status: "ACTIVE",
          publishedAt: new Date(),
          minPrice: item.price,
          maxPrice: item.price,
          inStock: true,
          tags: [item.categorySlug.replace(/-/g, " ")],
        },
      });
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          name: "Standard",
          price: item.price,
          stockQty: 20,
        },
      });
      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: `https://picsum.photos/seed/planthaat-${slug}/600/600`,
          isPrimary: true,
        },
      });
    }
  }
}

async function seedCustomers(prisma: PrismaClient, districtId: number) {
  const passwordHash = await argon2.hash(CUSTOMER_PASSWORD, { type: argon2.argon2id });
  const userIds: string[] = [];
  for (const [index, email] of DEMO_CUSTOMERS.entries()) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: `Demo Customer ${index + 1}`,
        passwordHash,
        role: "CUSTOMER",
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(user.id);
    const addressCount = await prisma.address.count({ where: { userId: user.id } });
    if (addressCount === 0) {
      await prisma.address.create({
        data: {
          userId: user.id,
          recipientName: `Demo Customer ${index + 1}`,
          phone: "01712345678",
          districtId,
          area: "Dhanmondi",
          addressLine: `House ${index + 1}, Road 5`,
          isDefault: true,
        },
      });
    }
  }
  return userIds;
}

async function seedOrders(prisma: PrismaClient, customerIds: string[], districtId: number) {
  const existing = await prisma.order.count();
  if (existing > 0 || customerIds.length === 0) {
    return;
  }

  const variant = await prisma.productVariant.findFirstOrThrow({
    include: { product: { include: { shop: true } } },
    orderBy: { createdAt: "asc" },
  });
  const address = await prisma.address.findFirstOrThrow({ where: { userId: customerIds[0] } });

  const orderNumber = generateOrderNumber();
  const quantity = 2;
  const subtotal = variant.price.mul(quantity);
  const delivery = new Prisma.Decimal(80);
  const commissionRate = new Prisma.Decimal(10);
  const commissionAmount = subtotal.mul(commissionRate).div(100).toDecimalPlaces(2);

  const total = subtotal.plus(delivery);
  const order = await prisma.order.create({
    data: {
      orderNumber,
      customerId: customerIds[0],
      contactName: address.recipientName,
      contactPhone: address.phone,
      shippingDistrictId: districtId,
      shippingDistrictName: "Dhaka",
      shippingArea: address.area,
      shippingAddressLine: address.addressLine,
      paymentMethod: "COD",
      paymentStatus: "PENDING",
      subtotal,
      deliveryTotal: delivery,
      grandTotal: total,
      shopOrders: {
        create: {
          shopOrderNumber: `${orderNumber}-1`,
          shopId: variant.product.shopId,
          status: "PENDING",
          subtotal,
          deliveryCharge: delivery,
          total,
          commissionAmount,
          sellerNetAmount: total.minus(commissionAmount),
          items: {
            create: {
              productId: variant.productId,
              variantId: variant.id,
              productName: variant.product.name,
              variantName: variant.name,
              unitPrice: variant.price,
              quantity,
              lineTotal: subtotal,
              commissionRate,
              commissionAmount,
            },
          },
          statusHistory: { create: { toStatus: "PENDING" } },
        },
      },
    },
    include: { shopOrders: { select: { id: true } } },
  });

  await prisma.payment.create({
    data: {
      orderId: order.id,
      shopOrderId: order.shopOrders[0].id,
      method: "COD",
      status: "PENDING",
      amount: total,
    },
  });
}

async function main(): Promise<void> {
  requireNonProduction();
  const prisma = createPrismaClient();
  try {
    await ensureReferenceData(prisma);
    const sellerProfileIds: string[] = [];
    await seedSellers(prisma, sellerProfileIds);
    const dhaka = await prisma.district.findFirstOrThrow({ where: { name: "Dhaka" } });
    const customerIds = await seedCustomers(prisma, dhaka.id);
    await seedOrders(prisma, customerIds, dhaka.id);

    console.log(
      [
        "Demo seed complete:",
        `  sellers: ${DEMO_SELLERS.length} (password ${SELLER_PASSWORD})`,
        `  plants: ${PRODUCT_NAMES.length}`,
        `  customers: ${DEMO_CUSTOMERS.length} (password ${CUSTOMER_PASSWORD})`,
        "  sample orders: 1 (PENDING)",
      ].join("\n"),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Demo seed failed", error);
  process.exit(1);
});
