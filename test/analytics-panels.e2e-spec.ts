import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { hashPassword } from "../src/common/utils/password";
import { AppConfigService } from "../src/config/app-config.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./cleanup";

const API = "/api/v1";

function suffix(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

describe("Dashboard analytics panels (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let categoryId: string;
  let districtId: number;
  let customerId: string;
  let shopA: { id: string; profileId: string };
  let shopB: { id: string; profileId: string };
  let productAId: string;
  let sellerA: ReturnType<typeof request.agent>;
  let admin: ReturnType<typeof request.agent>;

  const from = "2026-11-01T00:00:00.000Z";
  const to = "2026-11-30T23:59:59.000Z";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(AppConfigService), {
      swagger: false,
      helmet: false,
      staticFiles: false,
    });
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    const id = suffix();
    const category = await prisma.category.create({
      data: { name: `Plants ${id}`, slug: `plants-${id}`, isActive: true },
    });
    categoryId = category.id;
    const district = await prisma.district.create({
      data: { name: `Dhaka ${id}`, nameBn: "ঢাকা", division: "Dhaka" },
    });
    districtId = district.id;

    const customer = await prisma.user.create({
      data: {
        email: `customer-${id}@example.com`,
        name: "Customer",
        passwordHash: await hashPassword("Customer1"),
        role: "CUSTOMER",
        emailVerifiedAt: new Date(),
      },
    });
    customerId = customer.id;

    shopA = await createShop(id, "alpha");
    shopB = await createShop(id, "beta");

    const product = await prisma.product.create({
      data: {
        shopId: shopA.id,
        categoryId,
        name: "Monstera",
        slug: `monstera-${id}`,
        description: "desc",
        status: "ACTIVE",
        publishedAt: new Date(),
        minPrice: 500,
        maxPrice: 500,
        inStock: true,
      },
    });
    productAId = product.id;

    await seedOrders(id);

    const adminUser = await prisma.user.create({
      data: {
        email: `admin-${id}@example.com`,
        name: "Admin",
        passwordHash: await hashPassword("AdminStr0ng1"),
        role: "ADMIN",
        emailVerifiedAt: new Date(),
      },
    });

    sellerA = request.agent(server);
    await sellerA
      .post(`${API}/auth/login`)
      .send({ email: `seller-alpha-${id}@example.com`, password: "SellerPass1" })
      .expect(200);

    admin = request.agent(server);
    await admin
      .post(`${API}/auth/login`)
      .send({ email: adminUser.email, password: "AdminStr0ng1" })
      .expect(200);
  });

  async function createShop(id: string, tag: string) {
    const user = await prisma.user.create({
      data: {
        email: `seller-${tag}-${id}@example.com`,
        name: `Seller ${tag}`,
        passwordHash: await hashPassword("SellerPass1"),
        role: "SELLER",
        emailVerifiedAt: new Date(),
      },
    });
    const profile = await prisma.sellerProfile.create({
      data: {
        userId: user.id,
        businessName: `Shop ${tag} ${id}`,
        contactPhone: "01712345678",
        businessAddress: "addr",
        status: "APPROVED",
      },
    });
    const shop = await prisma.shop.create({
      data: {
        sellerProfileId: profile.id,
        name: `Shop ${tag} ${id}`,
        slug: `shop-${tag}-${id}`,
        status: "ACTIVE",
        approvedAt: new Date(),
        ratingAvg: 4.5,
        ratingCount: 2,
      },
    });
    return { id: shop.id, profileId: profile.id };
  }

  async function createOrder(input: {
    tag: string;
    shopId: string;
    status: "DELIVERED" | "PENDING" | "CANCELLED";
    method: "COD" | "ADVANCE";
    total: number;
    placedAt: Date;
    withItem?: boolean;
  }) {
    const id = suffix();
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${input.tag}-${id}`,
        customerId,
        contactName: "Customer",
        contactPhone: "01700000000",
        shippingDistrictId: districtId,
        shippingDistrictName: "Dhaka",
        shippingArea: "Dhanmondi",
        shippingAddressLine: "Road 1",
        paymentMethod: input.method,
        paymentStatus: input.status === "CANCELLED" ? "CANCELLED" : "PAID",
        subtotal: input.total - 60,
        deliveryTotal: 60,
        grandTotal: input.total,
        placedAt: input.placedAt,
      },
    });
    const shopOrder = await prisma.shopOrder.create({
      data: {
        shopOrderNumber: `SORD-${input.tag}-${id}`,
        orderId: order.id,
        shopId: input.shopId,
        status: input.status,
        subtotal: input.total - 60,
        deliveryCharge: 60,
        total: input.total,
        commissionAmount: Math.round(input.total * 0.1),
        sellerNetAmount: input.total - Math.round(input.total * 0.1),
        createdAt: input.placedAt,
        ...(input.status === "DELIVERED"
          ? {
              shippedAt: new Date(input.placedAt.getTime() + 2 * 86_400_000),
              deliveredAt: new Date(input.placedAt.getTime() + 4 * 86_400_000),
              releaseAt: new Date(input.placedAt.getTime() + 6 * 86_400_000),
            }
          : {}),
        ...(input.status === "CANCELLED" ? { cancelledAt: input.placedAt } : {}),
      },
    });
    if (input.withItem) {
      await prisma.orderItem.create({
        data: {
          shopOrderId: shopOrder.id,
          productId: productAId,
          productName: "Monstera",
          variantName: "Standard",
          unitPrice: input.total - 60,
          quantity: 1,
          lineTotal: input.total - 60,
          commissionRate: 10,
          commissionAmount: Math.round(input.total * 0.1),
        },
      });
    }
    return { order, shopOrder };
  }

  async function seedOrders(id: string) {
    const a1 = await createOrder({
      tag: `A1-${id}`,
      shopId: shopA.id,
      status: "DELIVERED",
      method: "COD",
      total: 1000,
      placedAt: new Date("2026-11-05T10:00:00.000Z"),
      withItem: true,
    });
    await createOrder({
      tag: `A2-${id}`,
      shopId: shopA.id,
      status: "PENDING",
      method: "ADVANCE",
      total: 500,
      placedAt: new Date("2026-11-10T10:00:00.000Z"),
    });
    const a3 = await createOrder({
      tag: `A3-${id}`,
      shopId: shopA.id,
      status: "DELIVERED",
      method: "COD",
      total: 2000,
      // 20:00Z is 02:00 the next day in Asia/Dhaka.
      placedAt: new Date("2026-11-20T20:00:00.000Z"),
    });
    await createOrder({
      tag: `B1-${id}`,
      shopId: shopB.id,
      status: "DELIVERED",
      method: "ADVANCE",
      total: 9000,
      placedAt: new Date("2026-11-12T10:00:00.000Z"),
    });

    await prisma.complaint.create({
      data: {
        ticketNumber: `CMP-${id}`,
        shopOrderId: a1.shopOrder.id,
        customerId,
        shopId: shopA.id,
        type: "DAMAGED_PLANT",
        description: "Leaves damaged",
        status: "OPEN",
        sellerResponseDueAt: new Date(Date.now() + 3600_000),
      },
    });

    const intent = await prisma.paymentIntent.create({
      data: {
        orderId: a3.order.id,
        amountDue: 2000,
        status: "PENDING_VERIFICATION",
        providerSnapshot: { provider: "BKASH" },
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await prisma.paymentSubmission.create({
      data: {
        intentId: intent.id,
        provider: "BKASH",
        trxId: `TRX${id}`,
        senderNumber: "01799999999",
        status: "PENDING",
        createdAt: new Date(Date.now() - 30 * 3_600_000),
      },
    });

    await prisma.payout.create({
      data: {
        payoutNumber: `PO-${id}`,
        sellerProfileId: shopA.profileId,
        amount: 700,
        status: "PENDING",
        requestedById: (
          await prisma.sellerProfile.findUniqueOrThrow({ where: { id: shopA.profileId } })
        ).userId,
      },
    });

    const item = await prisma.orderItem.findFirstOrThrow({
      where: { shopOrderId: a1.shopOrder.id },
    });
    await prisma.review.create({
      data: {
        productId: productAId,
        shopId: shopA.id,
        customerId,
        orderItemId: item.id,
        rating: 5,
        comment: "Great",
        status: "VISIBLE",
        createdAt: new Date("2026-11-06T10:00:00.000Z"),
      },
    });
  }

  it("returns admin panels consistent with the overview table totals", async () => {
    const overview = await admin.get(`${API}/admin/analytics/overview`).query({ from, to }).expect(200);
    const panels = await admin.get(`${API}/admin/analytics/panels`).query({ from, to }).expect(200);
    const data = panels.body.data;

    expect(data.bucket).toBe("day");
    expect(data.series.length).toBeLessThanOrEqual(92);
    const seriesOrders = data.series.reduce((sum: number, row: { orders: number }) => sum + row.orders, 0);
    const seriesGmv = data.series.reduce((sum: number, row: { gmv: string }) => sum + Number(row.gmv), 0);
    const seriesCommission = data.series.reduce(
      (sum: number, row: { commission: string }) => sum + Number(row.commission),
      0,
    );
    expect(seriesOrders).toBe(overview.body.data.orderCount);
    expect(Math.round(seriesGmv)).toBe(Math.round(Number(overview.body.data.gmv)));
    expect(Math.round(seriesCommission)).toBe(Math.round(Number(overview.body.data.commissionEarned)));
    expect(data.kpis.gmv.current).toBe(Number(overview.body.data.gmv).toFixed(2));

    // 20:00Z on the 20th is stored under the Dhaka calendar day 21.
    expect(data.series.some((row: { bucket: string }) => row.bucket === "2026-11-21")).toBe(true);
    expect(data.reconciliation.difference).toBe("0.00");
    expect(data.verification.pendingCount).toBe(1);
    expect(data.disputes.open).toBe(1);
    expect(data.withdrawals.pendingCount).toBe(1);
    expect(data.ratings.distribution.find((row: { rating: number }) => row.rating === 5)?.count).toBe(1);
  });

  it("scopes seller panels to the seller's own shop", async () => {
    const panels = await sellerA
      .get(`${API}/seller/analytics/panels`)
      .query({ from, to })
      .expect(200);
    const data = panels.body.data;
    expect(data.kpis.orders.current).toBe("3");
    expect(data.kpis.revenue.current).toBe("3000.00");
    expect(data.series.reduce((sum: number, row: { orders: number }) => sum + row.orders, 0)).toBe(3);
    expect(data.paymentMix.reduce((sum: number, row: { count: number }) => sum + row.count, 0)).toBe(3);
    expect(data.topProducts).toHaveLength(1);
    expect(data.disputes.open).toBe(1);
    expect(data.wallet).toMatchObject({ codDuesLimit: expect.any(String) });
  });

  it("caps series points for long ranges and keeps role permissions", async () => {
    const long = await admin
      .get(`${API}/admin/analytics/panels`)
      .query({ from: "2026-01-01T00:00:00.000Z", to: "2026-11-30T00:00:00.000Z" })
      .expect(200);
    expect(long.body.data.bucket).toBe("week");
    expect(long.body.data.series.length).toBeLessThanOrEqual(52);

    await sellerA.get(`${API}/admin/analytics/panels`).expect(403);
    await admin.get(`${API}/seller/analytics/panels`).expect(403);
  });

  it("never returns PII and responds within the dashboard budget", async () => {
    const started = Date.now();
    const panels = await admin.get(`${API}/admin/analytics/panels`).query({ from, to }).expect(200);
    expect(Date.now() - started).toBeLessThan(4000);
    const body = JSON.stringify(panels.body);
    expect(body).not.toContain("01799999999");
    expect(body).not.toContain("01712345678");
    expect(body).not.toContain("TRX");
    expect(body).not.toContain("@example.com");
    expect(body).not.toContain("senderNumber");
  });
});
