/**
 * Seeds the isolated `planthaat_test` database with ~90 days of realistic,
 * synthetic dashboard data (orders, statuses, payment methods, verification
 * queue, disputes, withdrawals, reviews, wallet buckets).
 *
 * Safety:
 * - Loads `.env.test` itself and refuses any database other than planthaat_test.
 * - Idempotent: if the marker shop exists it exits without duplicating rows.
 * - Every row is tagged (order/payout/ticket numbers, product slugs, ledger
 *   idempotency keys) so `seed-dashboard-kit-cleanup.ts` removes exactly this
 *   dataset. Never touches dev or production.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import { hashPassword } from "../src/common/utils/password";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/prisma/prisma-client";

loadEnv({ path: resolve(".env.test"), override: true });

const DATABASE_URL = process.env.DATABASE_URL ?? "";
if (!/planthaat_test/i.test(DATABASE_URL)) {
  throw new Error("Refusing to seed: .env.test is not the planthaat_test database");
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
const DAY = 86_400_000;
const now = new Date();

let seedState = 4_213;
function rand(): number {
  seedState = (seedState * 1_664_525 + 1_013_904_223) >>> 0;
  return seedState / 2 ** 32;
}
function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}
function money(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

const PRODUCTS = [
  { name: "Monstera Deliciosa", price: 1200, stock: 18 },
  { name: "Peace Lily", price: 650, stock: 6 },
  { name: "Snake Plant", price: 600, stock: 0 },
  { name: "Areca Palm", price: 800, stock: 24 },
  { name: "Echeveria", price: 350, stock: 2 },
];

const DISTRICTS = ["Dhaka", "Chattogram", "Sylhet", "Khulna", "Rajshahi"];
const OPEN_STATUSES = ["OPEN", "SELLER_RESPONDED", "UNDER_REVIEW"] as const;

async function main(): Promise<void> {
  const prisma: PrismaClient = createPrismaClient();
  try {
    const existing = await prisma.shop.findUnique({ where: { slug: SHOP_SLUG } });
    if (existing) {
      console.log(`[${MARK}] already seeded (shop ${SHOP_SLUG}); nothing to do.`);
      return;
    }

    const passwordHash = await hashPassword("Dashboard123!");
    const sellerUser = await prisma.user.create({
      data: {
        email: SELLER_EMAIL,
        name: "Dashboard Demo Seller",
        passwordHash,
        role: "SELLER",
        emailVerifiedAt: now,
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: CUSTOMER_EMAIL,
        name: "Dashboard Demo Customer",
        passwordHash,
        role: "CUSTOMER",
        emailVerifiedAt: now,
      },
    });
    const profile = await prisma.sellerProfile.create({
      data: {
        userId: sellerUser.id,
        businessName: "Dashboard Demo Nursery",
        contactPhone: "01700000000",
        businessAddress: "Demo address, Dhaka",
        status: "APPROVED",
        submittedAt: new Date(now.getTime() - 120 * DAY),
        reviewedAt: new Date(now.getTime() - 118 * DAY),
        verifiedAt: new Date(now.getTime() - 118 * DAY),
      },
    });
    const shop = await prisma.shop.create({
      data: {
        sellerProfileId: profile.id,
        name: "Dashboard Demo Nursery",
        slug: SHOP_SLUG,
        description: "Synthetic test data for admin and seller dashboards.",
        district: "Dhaka",
        status: "ACTIVE",
        approvedAt: new Date(now.getTime() - 118 * DAY),
        ratingAvg: 4.4,
        ratingCount: 0,
      },
    });
    const districtRows = await Promise.all(
      DISTRICTS.map((name) =>
        prisma.district.upsert({
          where: { name },
          update: {},
          create: { name, nameBn: name, division: name },
        }),
      ),
    );
    const category = await prisma.category.upsert({
      where: { slug: CATEGORY_SLUG },
      update: {},
      create: { name: "Dashboard Demo Plants", slug: CATEGORY_SLUG, isActive: true },
    });

    const products = [];
    for (const [index, product] of PRODUCTS.entries()) {
      const created = await prisma.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          name: product.name,
          slug: PRODUCT_SLUGS[index],
          description: "Synthetic demo product for dashboard review.",
          status: "ACTIVE",
          publishedAt: new Date(now.getTime() - 110 * DAY),
          minPrice: product.price,
          maxPrice: product.price,
          inStock: product.stock > 0,
          soldCount: 0,
        },
      });
      const variant = await prisma.productVariant.create({
        data: {
          productId: created.id,
          name: "Standard pot",
          sku: `${MARK}-SKU-${index}`,
          price: product.price,
          stockQty: product.stock,
          lowStockThreshold: 5,
        },
      });
      products.push({ product: created, variant });
    }

    const orderItems: { id: string; productId: string; orderId: string; deliveredAt: Date | null }[] = [];
    const deliveredShopOrders: { id: string; deliveredAt: Date }[] = [];
    let pendingIntentIndex = 0;

    for (let index = 0; index < 60; index += 1) {
      const ageDays = 95 - index * 1.55;
      const placedAt = new Date(now.getTime() - ageDays * DAY);
      const status =
        index >= 57
          ? "CANCELLED"
          : index >= 54
            ? "PENDING"
            : index >= 51
              ? "CONFIRMED"
              : index >= 47
                ? "PACKED"
                : index >= 42
                  ? "SHIPPED"
                  : index === 41
                    ? "FAILED_DELIVERY"
                    : "DELIVERED";
      const method = index % 3 === 0 ? "ADVANCE" : "COD";
      const selected = pick(products);
      const quantity = 1 + Math.floor(rand() * 2);
      const subtotal = Number(selected.variant.price) * quantity;
      const delivery = 60;
      const total = subtotal + delivery;
      const commission = Math.round(subtotal * 0.1);
      const sellerNet = total - commission;
      const district = pick(districtRows);
      const deliveredAt =
        status === "DELIVERED"
          ? new Date(Math.min(placedAt.getTime() + (3 + rand() * 4) * DAY, now.getTime() - 3_600_000))
          : null;
      const shippedAt = deliveredAt
        ? new Date(deliveredAt.getTime() - (1 + rand() * 2) * DAY)
        : status === "SHIPPED"
          ? new Date(now.getTime() - rand() * 2 * DAY)
          : null;
      const orderId = `${MARK}-ORD-${String(index).padStart(3, "0")}`;
      const order = await prisma.order.create({
        data: {
          orderNumber: orderId,
          customerId: customer.id,
          idempotencyKey: `${MARK}-IDEM-${index}`,
          contactName: "Dashboard Demo Customer",
          contactPhone: "01800000000",
          shippingDistrictId: district.id,
          shippingDistrictName: district.name,
          shippingArea: "Demo area",
          shippingAddressLine: "Demo road 1",
          paymentMethod: method,
          paymentStatus:
            status === "CANCELLED" ? "CANCELLED" : status === "DELIVERED" ? "PAID" : "PENDING",
          subtotal: money(subtotal),
          deliveryTotal: money(delivery),
          grandTotal: money(total),
          placedAt,
          createdAt: placedAt,
        },
      });
      const shopOrder = await prisma.shopOrder.create({
        data: {
          shopOrderNumber: `${MARK}-SORD-${String(index).padStart(3, "0")}`,
          orderId: order.id,
          shopId: shop.id,
          status,
          subtotal: money(subtotal),
          deliveryCharge: money(delivery),
          total: money(total),
          commissionAmount: money(commission),
          sellerNetAmount: money(sellerNet),
          createdAt: placedAt,
          confirmedAt: status !== "PENDING" && status !== "CANCELLED" ? new Date(placedAt.getTime() + 3_600_000) : null,
          packedAt: ["PACKED", "SHIPPED", "DELIVERED", "FAILED_DELIVERY"].includes(status)
            ? new Date(placedAt.getTime() + 7_200_000)
            : null,
          shippedAt,
          deliveredAt,
          releaseAt: deliveredAt ? new Date(deliveredAt.getTime() + 2 * DAY) : null,
          fundsReleasedAt:
            deliveredAt && deliveredAt.getTime() + 2 * DAY < now.getTime()
              ? new Date(deliveredAt.getTime() + 2 * DAY)
              : null,
          cancelledAt: status === "CANCELLED" ? new Date(placedAt.getTime() + 2 * 3_600_000) : null,
          cancelledBy: status === "CANCELLED" ? "CUSTOMER" : null,
          cancelReason: status === "CANCELLED" ? "Demo cancellation" : null,
        },
      });
      const item = await prisma.orderItem.create({
        data: {
          shopOrderId: shopOrder.id,
          productId: selected.product.id,
          variantId: selected.variant.id,
          productName: selected.product.name,
          variantName: selected.variant.name,
          unitPrice: selected.variant.price,
          quantity,
          lineTotal: money(subtotal),
          commissionRate: money(10),
          commissionAmount: money(commission),
        },
      });
      orderItems.push({
        id: item.id,
        productId: selected.product.id,
        orderId: order.id,
        deliveredAt,
      });
      if (deliveredAt) {
        deliveredShopOrders.push({ id: shopOrder.id, deliveredAt });
      }

      if (method === "ADVANCE") {
        const pending = pendingIntentIndex < 6 && index >= 45;
        const paid = !pending && status !== "CANCELLED";
        const intent = await prisma.paymentIntent.create({
          data: {
            orderId: order.id,
            amountDue: money(total),
            status: pending
              ? "PENDING_VERIFICATION"
              : paid
                ? "PAID"
                : status === "CANCELLED"
                  ? "EXPIRED"
                  : "UNPAID",
            providerSnapshot: { provider: index % 2 === 0 ? "BKASH" : "NAGAD" },
            expiresAt: new Date(placedAt.getTime() + 12 * 3_600_000),
            paidAt: paid ? new Date(placedAt.getTime() + 2 * 3_600_000) : null,
          },
        });
        if (pending) {
          const ageHours = [2, 9, 30, 55, 80, 130][pendingIntentIndex] ?? 5;
          await prisma.paymentSubmission.create({
            data: {
              intentId: intent.id,
              provider: index % 2 === 0 ? "BKASH" : "NAGAD",
              trxId: `${MARK}-TRX-${pendingIntentIndex}`,
              senderNumber: "01900000000",
              amountReceived: money(total),
              status: "PENDING",
              createdAt: new Date(now.getTime() - ageHours * 3_600_000),
            },
          });
          pendingIntentIndex += 1;
        } else if (paid) {
          await prisma.paymentSubmission.create({
            data: {
              intentId: intent.id,
              provider: index % 2 === 0 ? "BKASH" : "NAGAD",
              trxId: `${MARK}-TRX-PAID-${index}`,
              senderNumber: "01900000000",
              amountReceived: money(total),
              status: "VERIFIED",
              reviewedAt: new Date(placedAt.getTime() + 3 * 3_600_000),
              createdAt: new Date(placedAt.getTime() + 2 * 3_600_000),
            },
          });
        }
        if (paid && (index === 45 || index === 49)) {
          await prisma.refundObligation.create({
            data: {
              intentId: intent.id,
              amount: money(total),
              status: "REFUND_REQUIRED",
              reason: "Synthetic demo: order could not be fulfilled",
              createdAt: new Date(now.getTime() - index * 3_600_000),
            },
          });
        }
      } else {
        await prisma.payment.create({
          data: {
            orderId: order.id,
            shopOrderId: shopOrder.id,
            method: "COD",
            status: status === "CANCELLED" ? "CANCELLED" : "PAID",
            amount: money(total),
            paidAt: deliveredAt ?? null,
            createdAt: placedAt,
          },
        });
      }
    }

    // Reviews: one per delivered order item, with a realistic rating spread.
    const ratings = [5, 5, 4, 4, 3, 5, 2, 4, 5, 1, 4, 3];
    for (const [index, item] of orderItems
      .filter((entry) => entry.deliveredAt)
      .slice(0, ratings.length)
      .entries()) {
      await prisma.review.create({
        data: {
          productId: item.productId,
          shopId: shop.id,
          customerId: customer.id,
          orderItemId: item.id,
          rating: ratings[index],
          title: "Synthetic review",
          comment: "Synthetic demo review for dashboard charts.",
          status: "VISIBLE",
          createdAt: item.deliveredAt ?? now,
        },
      });
    }
    const ratingRows = await prisma.review.groupBy({
      by: ["rating"],
      where: { shopId: shop.id },
      _count: { _all: true },
      _avg: { rating: true },
    });
    const ratingCount = ratingRows.reduce((sum, row) => sum + row._count._all, 0);
    const ratingSum = ratingRows.reduce((sum, row) => sum + row.rating * row._count._all, 0);
    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        ratingCount,
        ratingAvg: ratingCount > 0 ? money(ratingSum / ratingCount) : money(0),
      },
    });

    // Disputes: open/queued/resolved mix with age and response deadlines.
    const complaintStatuses = [
      "OPEN",
      "SELLER_RESPONDED",
      "UNDER_REVIEW",
      "RESOLVED_REFUND",
      "REJECTED",
      "CLOSED",
      "OPEN",
      "RESOLVED_REPLACEMENT",
      "UNDER_REVIEW",
      "OPEN",
    ];
    const types = [
      "DAMAGED_PLANT",
      "WRONG_ITEM",
      "NOT_AS_DESCRIBED",
      "NOT_DELIVERED",
      "LATE_DELIVERY",
      "OTHER",
    ];
    for (const [index, target] of deliveredShopOrders.slice(0, complaintStatuses.length).entries()) {
      const status = complaintStatuses[index];
      const open = OPEN_STATUSES.includes(status as (typeof OPEN_STATUSES)[number]);
      const createdAt = new Date(now.getTime() - (index + 1) * 1.6 * DAY);
      await prisma.complaint.create({
        data: {
          ticketNumber: `${MARK}-CMP-${String(index).padStart(3, "0")}`,
          shopOrderId: target.id,
          customerId: customer.id,
          shopId: shop.id,
          type: types[index % types.length] as never,
          description: "Synthetic demo dispute for the dashboard.",
          status: status as never,
          decision: open
            ? "PENDING"
            : status === "RESOLVED_REFUND"
              ? "REFUND_PARTIAL"
              : status === "RESOLVED_REPLACEMENT"
                ? "RETURN_TO_SELLER"
                : "REJECTED",
          sellerResponseDueAt: open ? new Date(now.getTime() + (index - 1) * 12 * 3_600_000) : null,
          sellerRespondedAt: status === "SELLER_RESPONDED" ? new Date(now.getTime() - 3_600_000) : null,
          fundsHeldAt: open ? createdAt : null,
          decidedAt: open ? null : new Date(createdAt.getTime() + 2 * DAY),
          resolvedAt: open ? null : new Date(createdAt.getTime() + 2 * DAY),
          resolvedById: open ? null : sellerUser.id,
          resolutionNote: open ? null : "Synthetic resolution",
          refundAmount: status === "RESOLVED_REFUND" ? money(300) : null,
          createdAt,
        },
      });
    }

    // Withdrawals: pending/processing/paid/rejected with turnaround history.
    const payoutPlan: { status: "PENDING" | "PROCESSING" | "PAID" | "REJECTED"; ageDays: number; amount: number }[] = [
      { status: "PENDING", ageDays: 0.2, amount: 2500 },
      { status: "PENDING", ageDays: 1.4, amount: 1200 },
      { status: "PENDING", ageDays: 3.1, amount: 4000 },
      { status: "PROCESSING", ageDays: 2.2, amount: 1800 },
      ...Array.from({ length: 7 }, (_, index) => ({
        status: "PAID" as const,
        ageDays: 8 + index * 5,
        amount: 1500 + index * 400,
      })),
      { status: "REJECTED", ageDays: 12, amount: 900 },
    ];
    for (const [index, plan] of payoutPlan.entries()) {
      const createdAt = new Date(now.getTime() - plan.ageDays * DAY);
      const processed =
        plan.status === "PAID" || plan.status === "REJECTED"
          ? new Date(createdAt.getTime() + (1 + rand() * 2) * DAY)
          : null;
      await prisma.payout.create({
        data: {
          payoutNumber: `${MARK}-PO-${String(index).padStart(3, "0")}`,
          sellerProfileId: profile.id,
          amount: money(plan.amount),
          status: plan.status,
          method: "BKASH",
          accountMasked: "017*****00",
          reference: plan.status === "PAID" ? `${MARK}-REF-${index}` : null,
          requestedById: sellerUser.id,
          rejectionReason: plan.status === "REJECTED" ? "Synthetic rejection" : null,
          idempotencyKey: `${MARK}-WDR-${index}`,
          processedAt: processed,
          createdAt,
        },
      });
    }

    // Wallet ledger buckets (balanced conservation: receipts = buckets + payouts).
    const ledgerPlan: {
      account:
        | "BUYER_RECEIPTS"
        | "PLATFORM_HOLDINGS"
        | "SELLER_AVAILABLE"
        | "SELLER_PENDING"
        | "SELLER_ON_HOLD"
        | "SELLER_PAID_OUT"
        | "PLATFORM_COMMISSION"
        | "REFUND_PAYABLE"
        | "REFUNDS_PAID"
        | "COD_DUES";
      amount: number;
      type: string;
      releaseAt?: Date;
    }[] = [
      { account: "BUYER_RECEIPTS", amount: 100_000, type: "PAYMENT_RECEIVED" },
      { account: "PLATFORM_HOLDINGS", amount: 2_000, type: "PAYMENT_RECEIVED" },
      { account: "SELLER_AVAILABLE", amount: 28_000, type: "SELLER_RELEASE" },
      { account: "SELLER_ON_HOLD", amount: 5_000, type: "DISPUTE_HOLD" },
      { account: "SELLER_PAID_OUT", amount: 25_000, type: "WITHDRAWAL_PAID" },
      { account: "PLATFORM_COMMISSION", amount: 15_000, type: "COMMISSION" },
      { account: "REFUND_PAYABLE", amount: 3_000, type: "REFUND_PAYABLE_CREATED" },
      { account: "REFUNDS_PAID", amount: 2_000, type: "REFUND_PAID" },
      { account: "COD_DUES", amount: -4_000, type: "COD_DUES_ACCRUAL" },
      { account: "SELLER_PENDING", amount: 5_000, type: "SELLER_PENDING", releaseAt: new Date(now.getTime() + 2 * DAY) },
      { account: "SELLER_PENDING", amount: 6_000, type: "SELLER_PENDING", releaseAt: new Date(now.getTime() + 6 * DAY) },
      { account: "SELLER_PENDING", amount: 4_000, type: "SELLER_PENDING", releaseAt: new Date(now.getTime() + 11 * DAY) },
      { account: "SELLER_PENDING", amount: 5_000, type: "SELLER_PENDING", releaseAt: new Date(now.getTime() + 19 * DAY) },
    ];
    for (const [index, row] of ledgerPlan.entries()) {
      await prisma.ledgerEntry.create({
        data: {
          sellerProfileId: profile.id,
          account: row.account as never,
          amount: money(row.amount),
          type: row.type as never,
          description: "Synthetic dashboard demo ledger entry",
          releaseAt: row.releaseAt ?? null,
          idempotencyKey: `${MARK}-LEDGER-${index}`,
          createdAt: new Date(now.getTime() - (ledgerPlan.length - index) * 3_600_000),
        },
      });
    }

    console.log(
      `[${MARK}] seeded shop=${shop.id} orders=60 products=${products.length} reviews=${Math.min(orderItems.filter((i) => i.deliveredAt).length, ratings.length)}.`,
    );
    console.log(`[${MARK}] seller login: ${SELLER_EMAIL} / Dashboard123! (test DB only)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
