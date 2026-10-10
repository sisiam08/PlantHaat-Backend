import { randomUUID } from "node:crypto";

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
const ORIGIN = "http://localhost:3000";

function suffix(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

describe("Earnings & ledger (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let categoryId: string;
  let districtId: number;

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
    const category = await prisma.category.create({
      data: { name: "Plants", slug: `plants-${suffix()}`, isActive: true },
    });
    categoryId = category.id;
    const district = await prisma.district.create({
      data: { name: `Dhaka-${suffix()}`, nameBn: "ঢাকা", division: "Dhaka" },
    });
    districtId = district.id;
  });

  async function setupSeller(price: number) {
    const id = suffix();
    const password = "SellerPass1";
    const user = await prisma.user.create({
      data: {
        email: `seller_${id}@example.com`,
        name: "Seller",
        passwordHash: await hashPassword(password),
        role: "SELLER",
        emailVerifiedAt: new Date(),
      },
    });
    const profile = await prisma.sellerProfile.create({
      data: {
        userId: user.id,
        businessName: `Shop ${id}`,
        contactPhone: "01712345678",
        businessAddress: "addr",
        status: "APPROVED",
      },
    });
    const shop = await prisma.shop.create({
      data: {
        sellerProfileId: profile.id,
        name: `Shop ${id}`,
        slug: `shop-${id}`,
        status: "ACTIVE",
        approvedAt: new Date(),
      },
    });
    await prisma.shopDeliveryZone.create({
      data: { shopId: shop.id, name: "Zone", charge: 60, districts: { create: [{ districtId }] } },
    });
    const product = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId,
        name: `Plant ${id}`,
        slug: `plant-${id}`,
        description: "desc",
        status: "ACTIVE",
        publishedAt: new Date(),
        minPrice: price,
        maxPrice: price,
        inStock: true,
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, name: "Standard", price, stockQty: 5 },
    });

    const agent = request.agent(server);
    await agent.post(`${API}/auth/login`).send({ email: user.email, password }).expect(200);

    return { user, profile, shop, product, variant, agent };
  }

  async function createCustomer() {
    const agent = request.agent(server);
    const email = `cust_${suffix()}@example.com`;
    const reg = await agent
      .post(`${API}/auth/register`)
      .send({ email, password: "Str0ngPass1", name: "Customer" })
      .expect(201);
    const userId = reg.body.data.user.id as string;
    await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    const address = await prisma.address.create({
      data: {
        userId,
        recipientName: "Customer",
        phone: "01712345678",
        districtId,
        area: "Mirpur",
        addressLine: "House 1",
        isDefault: true,
      },
    });
    return { agent, userId, addressId: address.id };
  }

  async function placeDeliveredOrder(seller: Awaited<ReturnType<typeof setupSeller>>) {
    const customer = await createCustomer();
    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: seller.variant.id, quantity: 1 })
      .expect(200);
    const order = await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ addressId: customer.addressId })
      .expect(200);
    const shopOrderId = order.body.data.shopOrders[0].id as string;

    for (const status of ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"]) {
      await seller.agent
        .post(`${API}/seller/orders/${shopOrderId}/status`)
        .set("Origin", ORIGIN)
        .send({ status })
        .expect(200);
    }
    return { customer, shopOrderId, orderId: order.body.data.id as string };
  }

  async function adminAgent() {
    const email = `admin_${suffix()}@example.com`;
    await prisma.user.create({
      data: {
        email,
        name: "Admin",
        passwordHash: await hashPassword("AdminStr0ng1"),
        role: "ADMIN",
        emailVerifiedAt: new Date(),
      },
    });
    const agent = request.agent(server);
    await agent.post(`${API}/auth/login`).send({ email, password: "AdminStr0ng1" }).expect(200);
    return agent;
  }

  it("records COD commission on delivery, payouts, dues and refunds", async () => {
    const seller = await setupSeller(1000);
    await placeDeliveredOrder(seller);

    const ledger = await prisma.ledgerEntry.findMany({
      where: { sellerProfileId: seller.profile.id },
    });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe("COD_COMMISSION_DUE");
    expect(Number(ledger[0].amount)).toBe(-100);

    await seller.agent
      .get(`${API}/seller/earnings`)
      .expect(200)
      .expect((res) => {
        expect(Number(res.body.data.balance)).toBe(-100);
      });

    const admin = await adminAgent();
    await admin
      .post(`${API}/admin/payouts`)
      .set("Origin", ORIGIN)
      .send({ sellerProfileId: seller.profile.id, amount: 100, method: "BKASH" })
      .expect(201);
    await admin
      .post(`${API}/admin/sellers/${seller.profile.id}/dues-payments`)
      .set("Origin", ORIGIN)
      .send({ amount: 200 })
      .expect(200);

    const afterSettle = await prisma.ledgerEntry.aggregate({
      where: { sellerProfileId: seller.profile.id },
      _sum: { amount: true },
    });
    expect(Number(afterSettle._sum.amount)).toBe(0);

    // Refund the delivered shop order → commission reversal credits the seller.
    const payment = await prisma.payment.findFirstOrThrow({
      where: { shopOrder: { shop: { sellerProfileId: seller.profile.id } } },
    });
    const refund = await prisma.refund.create({
      data: {
        shopOrderId: (
          await prisma.shopOrder.findFirstOrThrow({
            where: { shop: { sellerProfileId: seller.profile.id } },
          })
        ).id,
        paymentId: payment.id,
        amount: 1000,
        reason: "Damaged on arrival",
        status: "REQUESTED",
        requestedById: seller.user.id,
      },
    });
    await admin
      .post(`${API}/admin/refunds/${refund.id}/process`)
      .set("Origin", ORIGIN)
      .send({ method: "BKASH", reference: "REF-1" })
      .expect(200);

    const balance = await prisma.ledgerEntry.aggregate({
      where: { sellerProfileId: seller.profile.id },
      _sum: { amount: true },
    });
    expect(Number(balance._sum.amount)).toBe(100);
  });

  it("manages commission rules and applies the most specific one", async () => {
    const seller = await setupSeller(1000);
    const admin = await adminAgent();

    await admin
      .post(`${API}/admin/commission-rules`)
      .set("Origin", ORIGIN)
      .send({ scope: "SELLER", sellerProfileId: seller.profile.id, ratePercent: 5 })
      .expect(201);

    const listed = await admin.get(`${API}/admin/commission-rules`).expect(200);
    expect(listed.body.data).toHaveLength(1);
    expect(Number(listed.body.data[0].ratePercent)).toBe(5);

    await placeDeliveredOrder(seller);

    const ledger = await prisma.ledgerEntry.findFirstOrThrow({
      where: { sellerProfileId: seller.profile.id, type: "COD_COMMISSION_DUE" },
    });
    // 5% of 1000
    expect(Number(ledger.amount)).toBe(-50);
  });
});
