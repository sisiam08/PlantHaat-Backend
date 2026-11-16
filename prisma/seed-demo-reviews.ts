import "dotenv/config";

import { Prisma } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/prisma/prisma-client";
import { recomputeReviewRatings } from "../src/modules/reviews/review-ratings";
import { requireDevDatabase, requireNonProduction } from "./demo-reviews/guards";
import {
  DEMO_REVIEW_ID_PREFIX,
  DEMO_REVIEW_ORDER_PREFIX,
  DEMO_REVIEW_PLAN,
} from "./demo-reviews/shared";

const DEMO_CUSTOMER_EMAILS = [
  "customer1@planthaat.test",
  "customer2@planthaat.test",
  "customer3@planthaat.test",
  "customer4@planthaat.test",
  "customer5@planthaat.test",
];

const DELIVERY_CHARGE = 80;
const COMMISSION_RATE = 10;
const ITEM_STOCK_DAYS = 3;

interface SelectedProduct {
  id: string;
  name: string;
  shopId: string;
  variantId: string;
  variantName: string;
  price: Prisma.Decimal;
}

async function selectProducts(
  prisma: ReturnType<typeof createPrismaClient>,
): Promise<SelectedProduct[]> {
  const products = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      inStock: true,
      variants: { some: { isActive: true, stockQty: { gt: 0 } } },
    },
    orderBy: { slug: "asc" },
    select: {
      id: true,
      name: true,
      shopId: true,
      variants: {
        where: { isActive: true, stockQty: { gt: 0 } },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        take: 1,
        select: { id: true, name: true, price: true },
      },
    },
  });

  const available = products.filter((product) => product.variants.length > 0);
  const selected: SelectedProduct[] = [];
  const usedShops = new Set<string>();

  // Prefer one product per shop first so ratings appear across storefronts.
  for (const product of available) {
    if (selected.length >= 8) break;
    if (usedShops.has(product.shopId)) continue;
    usedShops.add(product.shopId);
    const variant = product.variants[0]!;
    selected.push({
      id: product.id,
      name: product.name,
      shopId: product.shopId,
      variantId: variant.id,
      variantName: variant.name,
      price: variant.price,
    });
  }

  // Fill the remaining slots from any shop (still deterministic by slug).
  for (const product of available) {
    if (selected.length >= 8) break;
    if (selected.some((entry) => entry.id === product.id)) continue;
    const variant = product.variants[0]!;
    selected.push({
      id: product.id,
      name: product.name,
      shopId: product.shopId,
      variantId: variant.id,
      variantName: variant.name,
      price: variant.price,
    });
  }

  return selected;
}

async function main(): Promise<void> {
  requireNonProduction("the demo-review seed");
  requireDevDatabase("the demo-review seed");

  const prisma = createPrismaClient();
  try {
    const existing = await prisma.order.count({
      where: { orderNumber: { startsWith: DEMO_REVIEW_ORDER_PREFIX } },
    });
    if (existing > 0) {
      console.log(
        `Demo reviews already seeded (${existing} marker orders). Run "npm run db:seed:demo:reviews:cleanup" first to reseed.`,
      );
      return;
    }

    const products = await selectProducts(prisma);
    if (products.length < 8) {
      throw new Error(
        `Need at least 8 active in-stock products to seed reviews; found ${products.length}.`,
      );
    }

    const customers = await prisma.user.findMany({
      where: { email: { in: DEMO_CUSTOMER_EMAILS }, role: "CUSTOMER" },
      select: { id: true, email: true, name: true },
    });
    if (customers.length === 0) {
      throw new Error("Demo customers are missing. Run npm run db:seed:demo first.");
    }
    const addresses = await prisma.address.findMany({
      where: { userId: { in: customers.map((customer) => customer.id) } },
      include: { district: { select: { name: true } } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    const addressFor = (customerId: string) =>
      addresses.find((address) => address.userId === customerId) ?? addresses[0];
    if (!addressFor(customers[0]!.id)) {
      throw new Error("Demo customers have no address. Run npm run db:seed:demo first.");
    }

    const deliveredAt = new Date(Date.now() - ITEM_STOCK_DAYS * 86_400_000);
    const placedAt = new Date(deliveredAt.getTime() - 2 * 86_400_000);

    // One order per involved customer; each order holds its reviews' order items
    // grouped into one shop order per shop.
    const byCustomer = new Map<number, typeof DEMO_REVIEW_PLAN>();
    DEMO_REVIEW_PLAN.forEach((entry) => {
      const list = byCustomer.get(entry.customer) ?? [];
      list.push(entry);
      byCustomer.set(entry.customer, list);
    });

    const reviewRows: Prisma.ReviewCreateManyInput[] = [];
    const ratingPairs: { productId: string; shopId: string }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const [customerIndex, entries] of byCustomer.entries()) {
        const customer = customers[customerIndex % customers.length]!;
        const address = addressFor(customer.id)!;
        const orderNumber = `${DEMO_REVIEW_ORDER_PREFIX}${customerIndex + 1}`;

        const byShop = new Map<string, typeof entries>();
        for (const entry of entries) {
          const product = products[entry.slot]!;
          const list = byShop.get(product.shopId) ?? [];
          list.push(entry);
          byShop.set(product.shopId, list);
        }

        let subtotal = new Prisma.Decimal(0);
        const shopOrderData: Prisma.ShopOrderCreateWithoutOrderInput[] = [];
        let shopSeq = 0;

        for (const [shopId, shopEntries] of byShop.entries()) {
          shopSeq += 1;
          let shopSubtotal = new Prisma.Decimal(0);
          const items: Prisma.OrderItemCreateWithoutShopOrderInput[] = shopEntries.map((entry) => {
            const product = products[entry.slot]!;
            const commission = product.price
              .mul(COMMISSION_RATE)
              .div(100)
              .toDecimalPlaces(2);
            shopSubtotal = shopSubtotal.plus(product.price);
            return {
              id: `${DEMO_REVIEW_ID_PREFIX}item_${DEMO_REVIEW_PLAN.indexOf(entry)}`,
              productId: product.id,
              variantId: product.variantId,
              productName: product.name,
              variantName: product.variantName,
              unitPrice: product.price,
              quantity: 1,
              lineTotal: product.price,
              commissionRate: new Prisma.Decimal(COMMISSION_RATE),
              commissionAmount: commission,
            };
          });

          const delivery = new Prisma.Decimal(DELIVERY_CHARGE);
          const total = shopSubtotal.plus(delivery);
          const commissionAmount = shopEntries
            .reduce((sum, entry) => {
              const product = products[entry.slot]!;
              return sum.plus(product.price.mul(COMMISSION_RATE).div(100).toDecimalPlaces(2));
            }, new Prisma.Decimal(0));

          subtotal = subtotal.plus(shopSubtotal);
          shopOrderData.push({
            shopOrderNumber: `${orderNumber}-${shopSeq}`,
            shop: { connect: { id: shopId } },
            status: "DELIVERED",
            subtotal: shopSubtotal,
            deliveryCharge: delivery,
            total,
            commissionAmount,
            sellerNetAmount: total.minus(commissionAmount),
            confirmedAt: placedAt,
            shippedAt: new Date(placedAt.getTime() + 86_400_000),
            deliveredAt,
            items: { create: items },
            statusHistory: {
              create: [
                { toStatus: "CONFIRMED", changedByRole: "SELLER", createdAt: placedAt },
                {
                  toStatus: "SHIPPED",
                  changedByRole: "SELLER",
                  createdAt: new Date(placedAt.getTime() + 86_400_000),
                },
                { toStatus: "DELIVERED", changedByRole: "SELLER", createdAt: deliveredAt },
              ],
            },
          });
        }

        const deliveryTotal = new Prisma.Decimal(DELIVERY_CHARGE * byShop.size);
        const order = await tx.order.create({
          data: {
            orderNumber,
            customerId: customer.id,
            contactName: address.recipientName,
            contactPhone: address.phone,
            shippingDistrictId: address.districtId,
            shippingDistrictName: address.district.name,
            shippingArea: address.area,
            shippingAddressLine: address.addressLine,
            paymentMethod: "COD",
            paymentStatus: "PAID",
            subtotal,
            deliveryTotal,
            grandTotal: subtotal.plus(deliveryTotal),
            placedAt,
            shopOrders: { create: shopOrderData },
          },
          select: {
            id: true,
            shopOrders: { select: { id: true, total: true } },
          },
        });

        await tx.payment.createMany({
          data: order.shopOrders.map((shopOrder) => ({
            orderId: order.id,
            shopOrderId: shopOrder.id,
            method: "COD" as const,
            status: "PAID" as const,
            amount: shopOrder.total,
            paidAt: deliveredAt,
          })),
        });
      }

      DEMO_REVIEW_PLAN.forEach((entry, index) => {
        const product = products[entry.slot]!;
        const customer = customers[entry.customer % customers.length]!;
        reviewRows.push({
          id: `${DEMO_REVIEW_ID_PREFIX}${index}`,
          productId: product.id,
          shopId: product.shopId,
          customerId: customer.id,
          orderItemId: `${DEMO_REVIEW_ID_PREFIX}item_${index}`,
          rating: entry.rating,
          title: entry.title,
          comment: entry.comment,
          status: "VISIBLE",
          createdAt: new Date(deliveredAt.getTime() + 86_400_000),
          updatedAt: new Date(deliveredAt.getTime() + 86_400_000),
        });
        ratingPairs.push({ productId: product.id, shopId: product.shopId });
      });

      await tx.review.createMany({ data: reviewRows });

      const seen = new Set<string>();
      for (const pair of ratingPairs) {
        const key = `${pair.productId}:${pair.shopId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await recomputeReviewRatings(tx, pair.productId, pair.shopId);
      }
    }, { timeout: 120_000, maxWait: 20_000 });

    console.log("Demo review seed complete:");
    console.log(`  products with reviews: ${new Set(ratingPairs.map((p) => p.productId)).size}`);
    console.log(`  reviews created: ${reviewRows.length}`);
    console.log(`  marker orders: ${byCustomer.size} (${DEMO_REVIEW_ORDER_PREFIX}*)`);
    for (const [slot, product] of products.entries()) {
      const count = DEMO_REVIEW_PLAN.filter((entry) => entry.slot === slot).length;
      if (count > 0) {
        console.log(`  - ${product.name}: ${count} review${count === 1 ? "" : "s"}`);
      }
    }
    console.log(
      'Remove only this demo data with: npm run db:seed:demo:reviews:cleanup',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
