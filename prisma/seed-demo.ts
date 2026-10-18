import "dotenv/config";

import { randomUUID } from "node:crypto";

import argon2 from "argon2";
import sharp from "sharp";

import { generateOrderNumber } from "../src/common/utils/order-number";
import { toSlug, toUniqueSlug } from "../src/common/utils/slug";
import { AppConfigService } from "../src/config/app-config.service";
import { validateEnv } from "../src/config/env.validation";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/prisma/prisma-client";
import { LocalStorageDriver } from "../src/modules/uploads/storage/local-storage.driver";
import { S3StorageDriver } from "../src/modules/uploads/storage/s3-storage.driver";
import type { StorageService } from "../src/modules/uploads/storage/storage.types";
import { DISTRICTS } from "./data/bd-districts";
import { DEFAULT_CATEGORIES } from "./data/categories";

const SELLER_PASSWORD = "SellerDemo1";
const CUSTOMER_PASSWORD = "CustomerDemo1";

interface DemoVariant {
  name: string;
  price: number;
  stockQty: number;
}

interface DemoProduct {
  name: string;
  categorySlug: string;
  price: number;
  variants?: DemoVariant[];
  /** Number of gallery images; 3–5 get varied aspect ratios for the product page. */
  imageCount?: number;
  /** All variants out of stock (product is still visible but not in stock). */
  outOfStock?: boolean;
}

interface DemoZone {
  name: string;
  isNationwide: boolean;
  districts?: string[];
  charge: number;
  freeDeliveryAbove: number | null;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}

interface DemoSeller {
  name: string;
  email: string;
  district: string;
  zone: DemoZone;
}

const DEMO_SELLERS: DemoSeller[] = [
  {
    name: "Rahim Nursery",
    email: "seller1@planthaat.test",
    district: "Dhaka",
    zone: {
      name: "Nationwide",
      isNationwide: true,
      charge: 80,
      freeDeliveryAbove: 1500,
      estimatedDaysMin: 1,
      estimatedDaysMax: 3,
    },
  },
  {
    name: "Chattogram Green House",
    email: "seller2@planthaat.test",
    district: "Chattogram",
    zone: {
      name: "Dhaka · Chattogram · Sylhet",
      isNationwide: false,
      districts: ["Dhaka", "Chattogram", "Sylhet"],
      charge: 100,
      freeDeliveryAbove: 2000,
      estimatedDaysMin: 1,
      estimatedDaysMax: 4,
    },
  },
  {
    name: "Sylhet Plant Hub",
    email: "seller3@planthaat.test",
    district: "Sylhet",
    zone: {
      name: "Nationwide",
      isNationwide: true,
      charge: 90,
      freeDeliveryAbove: 1800,
      estimatedDaysMin: 2,
      estimatedDaysMax: 5,
    },
  },
];

const DEMO_CUSTOMERS = [
  "customer1@planthaat.test",
  "customer2@planthaat.test",
  "customer3@planthaat.test",
  "customer4@planthaat.test",
  "customer5@planthaat.test",
];

const PRODUCTS: DemoProduct[] = [
  // Indoor Plants
  {
    name: "Monstera Deliciosa",
    categorySlug: "indoor-plants",
    price: 850,
    imageCount: 5,
    variants: [
      { name: "Small", price: 650, stockQty: 12 },
      { name: "Medium", price: 850, stockQty: 10 },
      { name: "Large", price: 1400, stockQty: 4 },
    ],
  },
  { name: "Snake Plant", categorySlug: "indoor-plants", price: 550, imageCount: 3 },
  { name: "Peace Lily", categorySlug: "indoor-plants", price: 620, imageCount: 3 },
  { name: "ZZ Plant", categorySlug: "indoor-plants", price: 700 },
  {
    name: "Fiddle Leaf Fig",
    categorySlug: "indoor-plants",
    price: 1400,
    imageCount: 4,
    variants: [
      { name: "2 ft", price: 1400, stockQty: 6 },
      { name: "4 ft", price: 2400, stockQty: 2 },
    ],
  },
  { name: "Areca Palm", categorySlug: "indoor-plants", price: 900 },

  // Outdoor Plants
  { name: "Bougainvillea", categorySlug: "outdoor-plants", price: 500 },
  { name: "Hibiscus", categorySlug: "outdoor-plants", price: 450 },
  { name: "Ixora", categorySlug: "outdoor-plants", price: 420 },
  { name: "Duranta", categorySlug: "outdoor-plants", price: 380 },
  { name: "Croton", categorySlug: "outdoor-plants", price: 600 },
  { name: "Ficus Hedge", categorySlug: "outdoor-plants", price: 350 },

  // Flowering Plants
  {
    name: "Rose",
    categorySlug: "flowering-plants",
    price: 350,
    imageCount: 4,
    variants: [
      { name: "Red", price: 350, stockQty: 15 },
      { name: "Pink", price: 350, stockQty: 15 },
      { name: "White", price: 380, stockQty: 8 },
    ],
  },
  { name: "Jasmine", categorySlug: "flowering-plants", price: 400 },
  { name: "Marigold", categorySlug: "flowering-plants", price: 150 },
  { name: "Orchid", categorySlug: "flowering-plants", price: 1200, imageCount: 5 },
  { name: "Dahlia", categorySlug: "flowering-plants", price: 300 },
  { name: "Chrysanthemum", categorySlug: "flowering-plants", price: 280 },

  // Fruit Plants
  { name: "Mango (Grafted)", categorySlug: "fruit-plants", price: 650, imageCount: 3 },
  { name: "Guava", categorySlug: "fruit-plants", price: 450 },
  { name: "Lemon", categorySlug: "fruit-plants", price: 500 },
  {
    name: "Lychee",
    categorySlug: "fruit-plants",
    price: 900,
    variants: [{ name: "Standard", price: 900, stockQty: 2 }],
  },
  { name: "Papaya", categorySlug: "fruit-plants", price: 250, outOfStock: true },
  { name: "Banana", categorySlug: "fruit-plants", price: 300 },

  // Herbs & Medicinal
  { name: "Tulsi", categorySlug: "herbs-medicinal", price: 200 },
  { name: "Mint", categorySlug: "herbs-medicinal", price: 120 },
  { name: "Aloe Vera", categorySlug: "herbs-medicinal", price: 250 },
  { name: "Curry Leaf", categorySlug: "herbs-medicinal", price: 220 },
  { name: "Lemongrass", categorySlug: "herbs-medicinal", price: 150 },
  { name: "Fenugreek", categorySlug: "herbs-medicinal", price: 130, outOfStock: true },

  // Succulents & Cactus
  { name: "Echeveria", categorySlug: "succulents-cactus", price: 320, imageCount: 4 },
  { name: "Haworthia", categorySlug: "succulents-cactus", price: 280 },
  { name: "Jade Plant", categorySlug: "succulents-cactus", price: 400 },
  {
    name: "Barrel Cactus",
    categorySlug: "succulents-cactus",
    price: 550,
    imageCount: 3,
    variants: [{ name: "Standard", price: 550, stockQty: 1 }],
  },
  { name: "Zebra Plant", categorySlug: "succulents-cactus", price: 350 },
  { name: "Aloe Variegata", categorySlug: "succulents-cactus", price: 300 },

  // Bonsai
  { name: "Ficus Bonsai", categorySlug: "bonsai", price: 2500, imageCount: 4 },
  { name: "Juniper Bonsai", categorySlug: "bonsai", price: 3200, imageCount: 3 },
  { name: "Chinese Elm Bonsai", categorySlug: "bonsai", price: 2800 },
  {
    name: "Fukien Tea Bonsai",
    categorySlug: "bonsai",
    price: 2200,
    variants: [{ name: "Standard", price: 2200, stockQty: 2 }],
  },
  { name: "Jade Bonsai", categorySlug: "bonsai", price: 1800 },
  { name: "Money Tree Bonsai", categorySlug: "bonsai", price: 2000 },

  // Seeds
  { name: "Basil Seeds", categorySlug: "seeds", price: 80 },
  { name: "Tomato Seeds", categorySlug: "seeds", price: 60 },
  { name: "Sunflower Seeds", categorySlug: "seeds", price: 90 },
  { name: "Marigold Seeds", categorySlug: "seeds", price: 70 },
  { name: "Coriander Seeds", categorySlug: "seeds", price: 55 },
  { name: "Chilli Seeds", categorySlug: "seeds", price: 65 },

  // Pots & Planters
  {
    name: "Terracotta Pot 8in",
    categorySlug: "pots-planters",
    price: 220,
    variants: [
      { name: '6 in', price: 180, stockQty: 20 },
      { name: '8 in', price: 220, stockQty: 18 },
      { name: '10 in', price: 300, stockQty: 9 },
    ],
  },
  { name: "Ceramic Planter", categorySlug: "pots-planters", price: 650, imageCount: 3 },
  { name: "Hanging Basket", categorySlug: "pots-planters", price: 350 },
  { name: "Self-Watering Pot", categorySlug: "pots-planters", price: 550 },
  { name: "Grow Bag", categorySlug: "pots-planters", price: 120, outOfStock: true },
  { name: "Wall Planter", categorySlug: "pots-planters", price: 480 },

  // Soil & Fertilizer
  {
    name: "Organic Compost 5kg",
    categorySlug: "soil-fertilizer",
    price: 180,
    variants: [
      { name: "2 kg", price: 90, stockQty: 30 },
      { name: "5 kg", price: 180, stockQty: 25 },
      { name: "10 kg", price: 320, stockQty: 12 },
    ],
  },
  { name: "Vermicompost 2kg", categorySlug: "soil-fertilizer", price: 150 },
  { name: "NPK Fertilizer 1kg", categorySlug: "soil-fertilizer", price: 320 },
  { name: "Bone Meal 1kg", categorySlug: "soil-fertilizer", price: 260 },
  { name: "Coco Peat Block", categorySlug: "soil-fertilizer", price: 400 },
  { name: "Neem Cake 1kg", categorySlug: "soil-fertilizer", price: 210 },

  // Gardening Tools
  { name: "Pruning Shears", categorySlug: "gardening-tools", price: 450 },
  { name: "Hand Trowel", categorySlug: "gardening-tools", price: 180 },
  { name: "Watering Can 5L", categorySlug: "gardening-tools", price: 380 },
  { name: "Garden Gloves", categorySlug: "gardening-tools", price: 150 },
  { name: "Seed Starter Tray", categorySlug: "gardening-tools", price: 220 },
  { name: "Spray Bottle 2L", categorySlug: "gardening-tools", price: 190 },
];

const MULTI_IMAGE_DIMENSIONS = [
  { width: 1600, height: 1200 },
  { width: 1200, height: 1600 },
  { width: 1500, height: 1000 },
  { width: 1300, height: 1300 },
  { width: 2000, height: 1500 },
];
const SINGLE_IMAGE_DIMENSIONS = { width: 1200, height: 900 };
const CATEGORY_IMAGE_DIMENSIONS = { width: 800, height: 600 };

function requireNonProduction(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run the demo seed with NODE_ENV=production");
  }
}

function createStorage(): StorageService {
  const config = new AppConfigService(validateEnv(process.env));
  return config.values.STORAGE_DRIVER === "s3"
    ? new S3StorageDriver(config)
    : new LocalStorageDriver(config);
}

/** A simple, font-free SVG so sharp can rasterize it without any network access. */
function placeholderSvg(width: number, height: number, hue: number): Buffer {
  const plantRadius = Math.min(width, height) * 0.26;
  const potWidth = width * 0.4;
  const potHeight = height * 0.2;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="hsl(${hue}, 42%, 74%)"/>`,
    `<circle cx="${width * 0.5}" cy="${height * 0.4}" r="${plantRadius}" fill="hsl(${hue}, 55%, 38%)"/>`,
    `<circle cx="${width * 0.5}" cy="${height * 0.4}" r="${plantRadius * 0.45}" fill="hsl(${hue}, 60%, 55%)"/>`,
    `<rect x="${(width - potWidth) / 2}" y="${height * 0.6}" width="${potWidth}" height="${potHeight}" rx="${potHeight * 0.15}" fill="hsl(${(hue + 24) % 360}, 48%, 32%)"/>`,
    "</svg>",
  ].join("");
  return Buffer.from(svg);
}

async function storePlaceholder(
  storage: StorageService,
  keyPrefix: string,
  width: number,
  height: number,
  hue: number,
): Promise<string> {
  const buffer = await sharp(placeholderSvg(width, height, hue)).webp({ quality: 80 }).toBuffer();
  const stored = await storage.put({
    key: `${keyPrefix}/${randomUUID()}.webp`,
    buffer,
    contentType: "image/webp",
    visibility: "public",
  });
  return stored.url;
}

function hueFor(input: string): number {
  let hash = 0;
  for (const char of input) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return hash;
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

async function ensureCategoryImages(prisma: PrismaClient, storage: StorageService): Promise<void> {
  const categories = await prisma.category.findMany({
    select: { id: true, slug: true, imageUrl: true },
  });
  for (const category of categories) {
    if (category.imageUrl) continue;
    const url = await storePlaceholder(
      storage,
      `images/category/${category.slug}`,
      CATEGORY_IMAGE_DIMENSIONS.width,
      CATEGORY_IMAGE_DIMENSIONS.height,
      hueFor(category.slug),
    );
    await prisma.category.update({ where: { id: category.id }, data: { imageUrl: url } });
  }
}

async function loadDistrictIds(prisma: PrismaClient): Promise<Map<string, number>> {
  const districts = await prisma.district.findMany({ select: { id: true, name: true } });
  return new Map(districts.map((district) => [district.name, district.id]));
}

async function ensureProductImages(
  prisma: PrismaClient,
  storage: StorageService,
  productId: string,
  product: DemoProduct,
): Promise<void> {
  const existing = await prisma.productImage.findMany({
    where: { productId },
    select: { url: true },
  });
  const needsRegeneration =
    existing.length === 0 || existing.some((image) => image.url.includes("picsum.photos"));
  if (!needsRegeneration) return;

  if (existing.length > 0) {
    await prisma.productImage.deleteMany({ where: { productId } });
  }

  const count = Math.min(Math.max(product.imageCount ?? 1, 1), 5);
  const hue = hueFor(product.name);
  for (let index = 0; index < count; index += 1) {
    const dimensions =
      count > 1
        ? MULTI_IMAGE_DIMENSIONS[index % MULTI_IMAGE_DIMENSIONS.length]
        : SINGLE_IMAGE_DIMENSIONS;
    const url = await storePlaceholder(
      storage,
      `images/product/${productId}`,
      dimensions.width,
      dimensions.height,
      (hue + index * 18) % 360,
    );
    await prisma.productImage.create({
      data: {
        productId,
        url,
        altText: product.name,
        sortOrder: index,
        isPrimary: index === 0,
      },
    });
  }
}

function resolveVariants(product: DemoProduct): DemoVariant[] {
  if (product.variants && product.variants.length > 0) {
    return product.outOfStock
      ? product.variants.map((variant) => ({ ...variant, stockQty: 0 }))
      : product.variants;
  }
  return [{ name: "Standard", price: product.price, stockQty: product.outOfStock ? 0 : 20 }];
}

const LIGHT_VALUES = [
  "FULL_SUN",
  "PARTIAL_SHADE",
  "SHADE",
  "BRIGHT_INDIRECT",
  "LOW_LIGHT",
] as const;
const DIFFICULTY_VALUES = ["EASY", "MODERATE", "HARD"] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

async function seedProduct(
  prisma: PrismaClient,
  storage: StorageService,
  product: DemoProduct,
  shopId: string,
  categoryId: string,
): Promise<void> {
  const variants = resolveVariants(product);

  // Deterministic demo attributes so the storefront filters have data:
  // light/difficulty spread across the enum values, indoor by category, and
  // ~1/3 of products carry a discount on their first variant.
  const seed = hashString(product.name);
  const lightRequirement = LIGHT_VALUES[seed % LIGHT_VALUES.length];
  const careDifficulty = DIFFICULTY_VALUES[seed % DIFFICULTY_VALUES.length];
  const isIndoor = product.categorySlug === "indoor-plants";
  const isPetSafe = seed % 2 === 0;
  const discounted = seed % 3 === 0;

  let record = await prisma.product.findFirst({ where: { name: product.name }, select: { id: true } });
  if (!record) {
    record = await prisma.product.create({
      data: {
        shopId,
        categoryId,
        name: product.name,
        slug: toUniqueSlug(product.name),
        description: `${product.name} — healthy, nursery-grown and ready for delivery.`,
        status: "ACTIVE",
        publishedAt: new Date(),
        lightRequirement,
        careDifficulty,
        isIndoor,
        isPetSafe,
        minPrice: Math.min(...variants.map((variant) => variant.price)),
        maxPrice: Math.max(...variants.map((variant) => variant.price)),
        inStock: variants.some((variant) => variant.stockQty > 0),
        tags: [product.categorySlug.replace(/-/g, " ")],
      },
      select: { id: true },
    });
  } else {
    await prisma.product.update({
      where: { id: record.id },
      data: { lightRequirement, careDifficulty, isIndoor, isPetSafe },
    });
  }

  const variantCount = await prisma.productVariant.count({ where: { productId: record.id } });
  if (variantCount === 0) {
    for (const [index, variant] of variants.entries()) {
      await prisma.productVariant.create({
        data: {
          productId: record.id,
          name: variant.name,
          price: variant.price,
          compareAtPrice:
            discounted && index === 0 ? Math.round(variant.price * 1.25) : null,
          stockQty: variant.stockQty,
          sortOrder: index,
        },
      });
    }
  } else if (discounted) {
    const first = await prisma.productVariant.findFirst({
      where: { productId: record.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, price: true, compareAtPrice: true },
    });
    if (first && first.compareAtPrice === null) {
      await prisma.productVariant.update({
        where: { id: first.id },
        data: { compareAtPrice: Math.round(Number(first.price) * 1.25) },
      });
    }
  }

  await ensureProductImages(prisma, storage, record.id, product);

  const storedVariants = await prisma.productVariant.findMany({
    where: { productId: record.id },
    select: { price: true, stockQty: true, compareAtPrice: true },
  });
  if (storedVariants.length > 0) {
    const prices = storedVariants.map((variant) => Number(variant.price));
    const hasDiscount = storedVariants.some(
      (variant) =>
        variant.compareAtPrice !== null && Number(variant.compareAtPrice) > Number(variant.price),
    );
    await prisma.product.update({
      where: { id: record.id },
      data: {
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        inStock: storedVariants.some((variant) => variant.stockQty > 0),
        hasDiscount,
      },
    });
  }
}

async function seedSellers(
  prisma: PrismaClient,
  storage: StorageService,
  districtIds: Map<string, number>,
): Promise<void> {
  const passwordHash = await argon2.hash(SELLER_PASSWORD, { type: argon2.argon2id });
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));

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

    let shop = await prisma.shop.findFirst({ where: { sellerProfileId: profile.id } });
    if (!shop) {
      shop = await prisma.shop.create({
        data: {
          sellerProfileId: profile.id,
          name: seller.name,
          slug: toSlug(seller.name),
          description: `${seller.name} — verified PlantHaat seller.`,
          district: seller.district,
          status: "ACTIVE",
          approvedAt: new Date(),
          logoUrl: await storePlaceholder(storage, `images/shop-logo/${profile.id}`, 256, 256, hueFor(seller.name)),
        },
      });
    } else {
      await prisma.shop.update({ where: { id: shop.id }, data: { status: "ACTIVE" } });
    }

    await ensureDeliveryZones(prisma, shop.id, seller.zone, districtIds);

    const assigned = PRODUCTS.filter((_, index) => index % DEMO_SELLERS.length === sellerIndex);
    for (const product of assigned) {
      const categoryId = categoryBySlug.get(product.categorySlug);
      if (!categoryId) continue;
      await seedProduct(prisma, storage, product, shop.id, categoryId);
    }
  }
}

async function ensureDeliveryZones(
  prisma: PrismaClient,
  shopId: string,
  zone: DemoZone,
  districtIds: Map<string, number>,
): Promise<void> {
  const existing = await prisma.shopDeliveryZone.count({ where: { shopId } });
  if (existing > 0) return;

  const created = await prisma.shopDeliveryZone.create({
    data: {
      shopId,
      name: zone.name,
      isNationwide: zone.isNationwide,
      charge: zone.charge,
      freeDeliveryAbove: zone.freeDeliveryAbove,
      estimatedDaysMin: zone.estimatedDaysMin,
      estimatedDaysMax: zone.estimatedDaysMax,
    },
  });

  if (!zone.isNationwide && zone.districts) {
    const links = zone.districts
      .map((name) => districtIds.get(name))
      .filter((id): id is number => id !== undefined)
      .map((districtId) => ({ zoneId: created.id, districtId }));
    if (links.length > 0) {
      await prisma.zoneDistrict.createMany({ data: links });
    }
  }
}

async function seedCustomers(prisma: PrismaClient, districtId: number): Promise<string[]> {
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
  const storage = createStorage();
  try {
    await ensureReferenceData(prisma);
    await ensureCategoryImages(prisma, storage);
    const districtIds = await loadDistrictIds(prisma);
    await seedSellers(prisma, storage, districtIds);

    const dhaka = districtIds.get("Dhaka");
    if (dhaka === undefined) {
      throw new Error("Dhaka district is missing from the reference data");
    }
    const customerIds = await seedCustomers(prisma, dhaka);
    await seedOrders(prisma, customerIds, dhaka);

    const [products, categoriesWithImages] = await Promise.all([
      prisma.product.count({ where: { status: "ACTIVE", deletedAt: null } }),
      prisma.category.count({ where: { imageUrl: { not: null } } }),
    ]);

    console.log(
      [
        "Demo seed complete:",
        `  sellers: ${DEMO_SELLERS.length} (password ${SELLER_PASSWORD})`,
        `  active products: ${products}`,
        `  categories with images: ${categoriesWithImages}/${DEFAULT_CATEGORIES.length}`,
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
