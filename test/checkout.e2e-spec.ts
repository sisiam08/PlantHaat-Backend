import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
import { clearSettings } from "./settings-test-helper";
import {
  mapDistrictToSteadfast,
  useTestDeliveryRates,
} from "./delivery-fixtures";

const API = "/api/v1";
const ORIGIN = "http://localhost:3000";

function suffix(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

describe("Checkout & orders (e2e)", () => {
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
    await clearSettings(app, prisma);
    const category = await prisma.category.create({
      data: { name: "Plants", slug: `plants-${suffix()}`, isActive: true },
    });
    categoryId = category.id;
    const district = await prisma.district.create({
      data: { name: `Dhaka-${suffix()}`, nameBn: "ঢাকা", division: "Dhaka" },
    });
    districtId = district.id;
    await useTestDeliveryRates(app, prisma);
    await mapDistrictToSteadfast(prisma, districtId);
  });

  async function createShopWithProduct(price: number, stock: number) {
    const id = suffix();
    const user = await prisma.user.create({
      data: {
        email: `seller_${id}@example.com`,
        name: "Seller",
        passwordHash: await hashPassword("SellerPass1!"),
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
        district: "Dhaka",
        pickupDistrictId: districtId,
      },
    });
    await prisma.shopDeliveryZone.create({
      data: {
        shopId: shop.id,
        name: "Zone",
        charge: 60,
        districts: { create: [{ districtId }] },
      },
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
        inStock: stock > 0,
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, name: "Standard", price, stockQty: stock },
    });
    await prisma.productImage.create({
      data: { productId: product.id, url: "https://cdn.test/x.webp", isPrimary: true },
    });
    return { shop, product, variant };
  }

  async function createCustomer() {
    const agent = request.agent(server);
    const email = `cust_${suffix()}@example.com`;
    const reg = await agent
      .post(`${API}/auth/register`)
      .send({ email, password: "Str0ngPass1!", name: "Customer" })
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

  it("checks out a multi-shop cart and clears it", async () => {
    const shopA = await createShopWithProduct(850, 5);
    const shopB = await createShopWithProduct(500, 3);
    const customer = await createCustomer();

    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shopA.variant.id, quantity: 2 })
      .expect(200);
    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shopB.variant.id, quantity: 1 })
      .expect(200);

    const order = await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ addressId: customer.addressId, paymentMethod: "COD" })
      .expect(200);

    expect(order.body.data.shopOrders).toHaveLength(2);
    expect(order.body.data.payments).toHaveLength(2);
    expect(Number(order.body.data.subtotal)).toBe(850 * 2 + 500);
    expect(Number(order.body.data.deliveryTotal)).toBe(120);
    expect(order.body.data.overallStatus).toBe("PENDING");

    const stockA = await prisma.productVariant.findUniqueOrThrow({
      where: { id: shopA.variant.id },
    });
    expect(stockA.stockQty).toBe(3);
    const stockB = await prisma.productVariant.findUniqueOrThrow({
      where: { id: shopB.variant.id },
    });
    expect(stockB.stockQty).toBe(2);

    const cart = await customer.agent.get(`${API}/cart`).expect(200);
    expect(cart.body.data.shops).toHaveLength(0);
  });

  it("filters the customer order list by computed overall status", async () => {
    const shop = await createShopWithProduct(500, 5);
    const customer = await createCustomer();
    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shop.variant.id, quantity: 1 })
      .expect(200);
    const order = await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ addressId: customer.addressId, paymentMethod: "COD" })
      .expect(200);

    const shopOrderId = order.body.data.shopOrders[0].id as string;
    await prisma.shopOrder.update({ where: { id: shopOrderId }, data: { status: "DELIVERED" } });

    const delivered = await customer.agent
      .get(`${API}/orders?overallStatus=DELIVERED`)
      .expect(200);
    expect(delivered.body.meta.total).toBe(1);
    expect(delivered.body.data[0].id).toBe(order.body.data.id);

    const pending = await customer.agent
      .get(`${API}/orders?overallStatus=PENDING`)
      .expect(200);
    expect(pending.body.meta.total).toBe(0);

    const all = await customer.agent.get(`${API}/orders`).expect(200);
    expect(all.body.meta.total).toBe(1);

    const counts = await customer.agent.get(`${API}/orders/status-counts`).expect(200);
    expect(counts.body.data).toEqual({ all: 1, counts: { DELIVERED: 1 } });
  });

  it("clears purchased lines atomically and an idempotent retry never clears newer lines", async () => {
    const shopA = await createShopWithProduct(850, 5);
    const shopB = await createShopWithProduct(500, 5);
    const customer = await createCustomer();
    const key = randomUUID();

    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shopA.variant.id, quantity: 1 })
      .expect(200);
    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shopB.variant.id, quantity: 1 })
      .expect(200);

    const first = await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", key)
      .send({ addressId: customer.addressId, paymentMethod: "COD" })
      .expect(200);
    expect(await prisma.order.count({ where: { customerId: customer.userId } })).toBe(1);
    const empty = await customer.agent.get(`${API}/cart`).expect(200);
    expect(empty.body.data.shops).toHaveLength(0);

    // A newer line added after the order must survive an idempotent retry.
    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shopA.variant.id, quantity: 1 })
      .expect(200);
    const retry = await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", key)
      .send({ addressId: customer.addressId, paymentMethod: "COD" })
      .expect(200);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(await prisma.order.count({ where: { customerId: customer.userId } })).toBe(1);
    const afterRetry = await customer.agent.get(`${API}/cart`).expect(200);
    expect(afterRetry.body.data.shops).toHaveLength(1);
    expect(Number(afterRetry.body.data.shops[0].items[0].quantity)).toBe(1);
  });

  it("returns the free-delivery threshold per shop group", async () => {
    const shop = await createShopWithProduct(300, 10);
    await prisma.shopDeliveryZone.updateMany({
      where: { shopId: shop.shop.id },
      data: { freeDeliveryEnabled: true, freeDeliveryAbove: 1000 },
    });
    const customer = await createCustomer();

    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shop.variant.id, quantity: 2 })
      .expect(200);
    const withDistrict = await customer.agent
      .get(`${API}/cart?districtId=${districtId}`)
      .set("Origin", ORIGIN)
      .expect(200);
    const group = withDistrict.body.data.shops[0];
    expect(group.deliverable).toBe(true);
    expect(group.freeDeliveryAbove).toBe("1000");
    expect(Number(group.deliveryCharge)).toBe(60);
    expect(Number(group.subtotal)).toBe(600);
    expect(group.shop.logoUrl).toBeNull();
    expect(group.shop.verified).toBe(true);
    expect(group.shop.district).toBe("Dhaka");
    expect(group.estimatedDaysMin).toBeGreaterThan(0);
    expect(group.estimatedDaysMax).toBeGreaterThanOrEqual(group.estimatedDaysMin);
    expect(typeof group.items[0].image).toBe("string");

    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shop.variant.id, quantity: 3 })
      .expect(200);
    const belowThreshold = await customer.agent
      .get(`${API}/cart?districtId=${districtId}`)
      .set("Origin", ORIGIN)
      .expect(200);
    const stillCharged = belowThreshold.body.data.shops[0];
    expect(Number(stillCharged.subtotal)).toBe(900);
    expect(Number(stillCharged.deliveryCharge)).toBe(60);
    expect(stillCharged.freeDeliveryAbove).toBe("1000");

    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shop.variant.id, quantity: 4 })
      .expect(200);
    const free = await customer.agent
      .get(`${API}/cart?districtId=${districtId}`)
      .set("Origin", ORIGIN)
      .expect(200);
    expect(Number(free.body.data.shops[0].deliveryCharge)).toBe(0);
    expect(Number(free.body.data.deliveryTotal)).toBe(0);

    const noDistrict = await customer.agent
      .get(`${API}/cart`)
      .set("Origin", ORIGIN)
      .expect(200);
    expect(noDistrict.body.data.shops[0].deliverable).toBeNull();
    expect(noDistrict.body.data.shops[0].freeDeliveryAbove).toBeNull();
    expect(noDistrict.body.data.shops[0].deliveryCharge).toBeNull();
  });

  it("delivers nationwide with both payment methods when a shop has legacy zones", async () => {
    const shop = await createShopWithProduct(300, 10);
    const customer = await createCustomer();
    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shop.variant.id, quantity: 1 })
      .expect(200);

    const otherDistrict = await prisma.district.create({
      data: { name: `Sylhet-${suffix()}`, nameBn: "?????", division: "Sylhet" },
    });
    await mapDistrictToSteadfast(prisma, otherDistrict.id, 2);

    const res = await customer.agent
      .get(`${API}/cart?districtId=${otherDistrict.id}`)
      .set("Origin", ORIGIN)
      .expect(200);
    const group = res.body.data.shops[0];
    expect(group.deliverable).toBe(true);
    expect(Number(group.deliveryCharge)).toBe(60);
    expect(group.codAllowed).toBe(true);
    expect(group.advanceAllowed).toBe(true);
    expect(Number(res.body.data.deliveryTotal)).toBe(60);
  });

  it("enforces inside/outside Dhaka payment conditions", async () => {
    const shop = await createShopWithProduct(300, 10);
    const customer = await createCustomer();
    await prisma.district.update({ where: { id: districtId }, data: { insideDhaka: true } });
    await prisma.shopDeliveryZone.create({
      data: {
        shopId: shop.shop.id,
        name: "Inside Dhaka",
        isNationwide: true,
        charge: 80,
        condition: "INSIDE_DHAKA",
        paymentMode: "COD_ONLY",
      },
    });
    await prisma.shopDeliveryZone.create({
      data: {
        shopId: shop.shop.id,
        name: "Outside Dhaka",
        isNationwide: true,
        charge: 120,
        condition: "OUTSIDE_DHAKA",
        paymentMode: "ADVANCE_ONLY",
      },
    });

    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shop.variant.id, quantity: 1 })
      .expect(200);
    let cart = await customer.agent
      .get(`${API}/cart?districtId=${districtId}`)
      .expect(200);
    expect(cart.body.data.shops[0]).toMatchObject({
      deliveryCondition: "INSIDE_DHAKA",
      codAllowed: true,
      advanceAllowed: false,
    });

    await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ addressId: customer.addressId, paymentMethod: "ADVANCE" })
      .expect(400);

    await prisma.district.update({ where: { id: districtId }, data: { insideDhaka: false } });
    cart = await customer.agent
      .get(`${API}/cart?districtId=${districtId}`)
      .expect(200);
    expect(cart.body.data.shops[0]).toMatchObject({
      deliveryCondition: "OUTSIDE_DHAKA",
      codAllowed: false,
      advanceAllowed: true,
    });
    await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ addressId: customer.addressId, paymentMethod: "COD" })
      .expect(400);
  });

  it("backfills both delivery conditions idempotently without overwriting custom values", async () => {
    const shop = await createShopWithProduct(300, 10);
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20261125120000_backfill_delivery_conditions/migration.sql",
      ),
      "utf8",
    );
    await prisma.$executeRawUnsafe(sql);
    let conditions = await prisma.shopDeliveryZone.findMany({
      where: { shopId: shop.shop.id, condition: { not: null } },
      orderBy: { condition: "asc" },
    });
    expect(conditions).toHaveLength(2);
    expect(conditions.map((row) => row.condition)).toEqual([
      "INSIDE_DHAKA",
      "OUTSIDE_DHAKA",
    ]);
    expect(Number(conditions[0]?.charge)).toBe(60);
    expect(conditions.every((row) => row.paymentMode === "COD_AND_ADVANCE")).toBe(true);

    await prisma.shopDeliveryZone.update({
      where: { id: conditions[0]!.id },
      data: { charge: 99, paymentMode: "COD_ONLY" },
    });
    await prisma.$executeRawUnsafe(sql);
    conditions = await prisma.shopDeliveryZone.findMany({
      where: { shopId: shop.shop.id, condition: { not: null } },
      orderBy: { condition: "asc" },
    });
    expect(conditions).toHaveLength(2);
    expect(Number(conditions[0]?.charge)).toBe(99);
    expect(conditions[0]?.paymentMode).toBe("COD_ONLY");
  });

  it("is idempotent for the same Idempotency-Key", async () => {
    const shop = await createShopWithProduct(400, 5);
    const customer = await createCustomer();
    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shop.variant.id, quantity: 1 })
      .expect(200);

    const key = randomUUID();
    const first = await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", key)
      .send({ addressId: customer.addressId })
      .expect(200);
    const second = await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", key)
      .send({ addressId: customer.addressId })
      .expect(200);

    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await prisma.order.count()).toBe(1);
  });

  it("exposes payments to admins (list + detail)", async () => {
    const shop = await createShopWithProduct(500, 3);
    const customer = await createCustomer();
    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: shop.variant.id, quantity: 1 })
      .expect(200);
    const order = await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ addressId: customer.addressId })
      .expect(200);
    const orderNumber = order.body.data.orderNumber as string;

    const adminEmail = `admin_${suffix()}@example.com`;
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Admin",
        passwordHash: await hashPassword("AdminStr0ng1!"),
        role: "ADMIN",
        emailVerifiedAt: new Date(),
      },
    });
    const admin = request.agent(server);
    await admin
      .post(`${API}/auth/login`)
      .send({ email: adminEmail, password: "AdminStr0ng1!" })
      .expect(200);

    const list = await admin.get(`${API}/admin/payments?order=${orderNumber}`).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].orderNumber).toBe(orderNumber);
    expect(list.body.data[0].method).toBe("COD");

    const one = await admin
      .get(`${API}/admin/payments/${list.body.data[0].id}`)
      .expect(200);
    expect(one.body.data.shopOrderNumber).not.toBeNull();
  });

  it("lets exactly one of two concurrent buyers win the last unit", async () => {
    const shop = await createShopWithProduct(300, 1);
    const buyerA = await createCustomer();
    const buyerB = await createCustomer();

    for (const buyer of [buyerA, buyerB]) {
      await buyer.agent
        .put(`${API}/cart/items`)
        .set("Origin", ORIGIN)
        .send({ variantId: shop.variant.id, quantity: 1 })
        .expect(200);
    }

    const results = await Promise.all([
      buyerA.agent
        .post(`${API}/checkout`)
        .set("Origin", ORIGIN)
        .set("Idempotency-Key", randomUUID())
        .send({ addressId: buyerA.addressId }),
      buyerB.agent
        .post(`${API}/checkout`)
        .set("Origin", ORIGIN)
        .set("Idempotency-Key", randomUUID())
        .send({ addressId: buyerB.addressId }),
    ]);

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 422]);

    const finalStock = await prisma.productVariant.findUniqueOrThrow({
      where: { id: shop.variant.id },
    });
    expect(finalStock.stockQty).toBe(0);
    expect(await prisma.order.count()).toBe(1);
  });
});


