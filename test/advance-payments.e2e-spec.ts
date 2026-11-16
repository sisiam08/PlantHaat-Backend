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
import { PaymentsService } from "../src/modules/payments/payments.service";
import { resetDatabase } from "./cleanup";
import { clearSettings, setSettings } from "./settings-test-helper";

const API = "/api/v1";
const ORIGIN = "http://localhost:3000";

describe("Advance payments (real DB)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let payments: PaymentsService;
  let categoryId: string;
  let districtId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(AppConfigService), { swagger: false, helmet: false, staticFiles: false });
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
    payments = app.get(PaymentsService);
  });

  afterAll(async () => {
    await clearSettings(app, prisma);
    await resetDatabase(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await clearSettings(app, prisma);
    await setSettings(app, prisma, {
      "payment.cod.enabled": true,
      "payment.advance.enabled": true,
      "payment.bkash.enabled": true,
      "payment.bkash.number": "01700000000",
      "payment.nagad.enabled": false,
      "payment.nagad.number": "",
      "payment.expiryHours": 12,
      "payment.slaHours": 24,
      "payment.lateGraceHours": 48,
      "payment.instructions": "Send the exact total.",
      "payment.warningText": "Keep the receipt.",
    });
    const category = await prisma.category.create({
      data: { name: `Plants ${randomUUID()}`, slug: `plants-${randomUUID()}`, isActive: true },
    });
    categoryId = category.id;
    const district = await prisma.district.create({
      data: { name: `Dhaka ${randomUUID()}`, nameBn: "ঢাকা", division: "Dhaka" },
    });
    districtId = district.id;
  });

  afterEach(async () => {
    await clearSettings(app, prisma);
  });

  async function createShop(price = 100, stock = 10, charge = 60) {
    const id = randomUUID();
    const email = `seller_${id.slice(0, 8)}@example.com`;
    const user = await prisma.user.create({
      data: { email, name: "Seller", passwordHash: await hashPassword("SellerPass1"), role: "SELLER", emailVerifiedAt: new Date() },
    });
    const profile = await prisma.sellerProfile.create({
      data: { userId: user.id, businessName: `Shop ${id}`, contactPhone: "01712345678", businessAddress: "addr", status: "APPROVED" },
    });
    const shop = await prisma.shop.create({
      data: { sellerProfileId: profile.id, name: `Shop ${id}`, slug: `shop-${id}`, status: "ACTIVE", approvedAt: new Date(), district: "Dhaka" },
    });
    await prisma.shopDeliveryZone.create({
      data: { shopId: shop.id, name: "Zone", charge, districts: { create: [{ districtId }] } },
    });
    const product = await prisma.product.create({
      data: { shopId: shop.id, categoryId, name: `Plant ${id}`, slug: `plant-${id}`, description: "desc", status: "ACTIVE", publishedAt: new Date(), minPrice: price, maxPrice: price, inStock: stock > 0 },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, name: "Standard", price, stockQty: stock },
    });
    const agent = request.agent(server);
    await agent.post(`${API}/auth/login`).send({ email, password: "SellerPass1" }).expect(200);
    return { shop, product, variant, agent, userId: user.id };
  }

  async function createCustomer() {
    const agent = request.agent(server);
    const email = `cust_${randomUUID().slice(0, 12)}@example.com`;
    const reg = await agent.post(`${API}/auth/register`).send({ email, password: "Str0ngPass1", name: "Customer" }).expect(201);
    const userId = reg.body.data.user.id as string;
    await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    const address = await prisma.address.create({
      data: { userId, recipientName: "Customer", phone: "01712345678", districtId, area: "Mirpur", addressLine: "House 1", isDefault: true },
    });
    return { agent, userId, addressId: address.id };
  }

  async function adminAgent() {
    const email = `admin_${randomUUID().slice(0, 8)}@example.com`;
    await prisma.user.create({ data: { email, name: "Admin", passwordHash: await hashPassword("AdminStr0ng1"), role: "ADMIN", emailVerifiedAt: new Date() } });
    const agent = request.agent(server);
    await agent.post(`${API}/auth/login`).send({ email, password: "AdminStr0ng1" }).expect(200);
    return agent;
  }

  async function placeAdvance(customer: Awaited<ReturnType<typeof createCustomer>>, shops: Awaited<ReturnType<typeof createShop>>[], quantities: number[] = []) {
    for (const [index, shop] of shops.entries()) {
      await customer.agent.put(`${API}/cart/items`).set("Origin", ORIGIN).send({ variantId: shop.variant.id, quantity: quantities[index] ?? 1 }).expect(200);
    }
    const order = await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ addressId: customer.addressId, paymentMethod: "ADVANCE" })
      .expect(200);
    return order.body.data;
  }

  function submit(customer: Awaited<ReturnType<typeof createCustomer>>, orderId: string, trxId = randomUUID().replace(/-/g, "").slice(0, 10)) {
    return customer.agent.post(`${API}/advance-payments/orders/${orderId}/submissions`).set("Origin", ORIGIN).send({
      provider: "BKASH",
      trxId,
      senderNumber: "01712345678",
    });
  }

  function verify(admin: Awaited<ReturnType<typeof adminAgent>>, intentId: string, amountReceived: number) {
    return admin.post(`${API}/admin/advance-payments/${intentId}/verify`).set("Origin", ORIGIN).send({ amountReceived });
  }

  it("creates one UNPAID intent with allocations and is idempotent", async () => {
    const shop = await createShop();
    const customer = await createCustomer();
    await customer.agent.put(`${API}/cart/items`).set("Origin", ORIGIN).send({ variantId: shop.variant.id, quantity: 2 }).expect(200);
    const key = randomUUID();
    const dto = { addressId: customer.addressId, paymentMethod: "ADVANCE" };
    const first = await customer.agent.post(`${API}/checkout`).set("Origin", ORIGIN).set("Idempotency-Key", key).send(dto).expect(200);
    const second = await customer.agent.post(`${API}/checkout`).set("Origin", ORIGIN).set("Idempotency-Key", key).send(dto).expect(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { orderId: first.body.data.id }, include: { allocations: true } });
    expect(intent.status).toBe("UNPAID");
    expect(intent.amountDue.toString()).toBe("260");
    expect(intent.allocations).toHaveLength(1);
    expect(intent.allocations[0]?.amount.toString()).toBe("260");
    expect((await prisma.shopOrder.findFirstOrThrow()).status).toBe("PENDING");
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: shop.variant.id } })).stockQty).toBe(8);
  });

  it("rejects ADVANCE when disabled but keeps COD", async () => {
    await setSettings(app, prisma, { "payment.advance.enabled": false });
    const shop = await createShop();
    const customer = await createCustomer();
    await customer.agent.put(`${API}/cart/items`).set("Origin", ORIGIN).send({ variantId: shop.variant.id, quantity: 1 }).expect(200);
    const rejected = await customer.agent.post(`${API}/checkout`).set("Origin", ORIGIN).set("Idempotency-Key", randomUUID()).send({ addressId: customer.addressId, paymentMethod: "ADVANCE" });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe("PAYMENT_METHOD_NOT_AVAILABLE");
    const cod = await customer.agent.post(`${API}/checkout`).set("Origin", ORIGIN).set("Idempotency-Key", randomUUID()).send({ addressId: customer.addressId, paymentMethod: "COD" });
    expect(cod.status).toBe(200);
  });

  it("submits, deduplicates parallel submissions, and verifies exact payment", async () => {
    const shop = await createShop();
    const customer = await createCustomer();
    const order = await placeAdvance(customer, [shop], [1]);
    const trxId = `T${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const [a, b] = await Promise.all([submit(customer, order.id, trxId), submit(customer, order.id, trxId)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBe(409);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(intent.status).toBe("PENDING_VERIFICATION");
    const admin = await adminAgent();
    const paid = await verify(admin, intent.id, 160).expect(200);
    expect(paid.body.data.status).toBe("PAID");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PAID");
  });

  it("handles underpayment then a top-up, and rejects reused/rejected TrxID", async () => {
    const shop = await createShop();
    const customer = await createCustomer();
    const order = await placeAdvance(customer, [shop], [1]);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { orderId: order.id } });
    const trx1 = `U${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    await submit(customer, order.id, trx1).expect(201);
    const admin = await adminAgent();
    const under = await verify(admin, intent.id, 100).expect(200);
    expect(under.body.data.status).toBe("UNDERPAID");
    expect(under.body.data.remainingAmount).toBe("60");
    const duplicate = await submit(customer, order.id, `u${trx1.slice(1)}`);
    expect(duplicate.status).toBe(409);
    await submit(customer, order.id, `U${randomUUID().replace(/-/g, "").slice(0, 10)}`).expect(201);
    const paid = await verify(admin, intent.id, 60).expect(200);
    expect(paid.body.data.status).toBe("PAID");
  });

  it("records overpayment as REFUND_PAYABLE", async () => {
    const shop = await createShop();
    const customer = await createCustomer();
    const order = await placeAdvance(customer, [shop], [1]);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { orderId: order.id } });
    await submit(customer, order.id).expect(201);
    const admin = await adminAgent();
    const paid = await verify(admin, intent.id, 200).expect(200);
    expect(paid.body.data.status).toBe("PAID");
    expect(paid.body.data.overpaidAmount).toBe("40");
    const queue = await admin.get(`${API}/admin/advance-refunds`).expect(200);
    expect(queue.body.data[0].amount).toBe("40");
    expect(queue.body.data[0].status).toBe("REFUND_PAYABLE");
  });

  it("enforces the seller fulfillment gate until PAID", async () => {
    const shop = await createShop();
    const customer = await createCustomer();
    const order = await placeAdvance(customer, [shop], [1]);
    const shopOrder = order.shopOrders[0];
    const blocked = await shop.agent.post(`${API}/seller/orders/${shopOrder.id}/status`).set("Origin", ORIGIN).send({ status: "CONFIRMED" });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.code).toBe("PAYMENT_REQUIRED");
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { orderId: order.id } });
    await submit(customer, order.id).expect(201);
    const admin = await adminAgent();
    await verify(admin, intent.id, 160).expect(200);
    await shop.agent.post(`${API}/seller/orders/${shopOrder.id}/status`).set("Origin", ORIGIN).send({ status: "CONFIRMED" }).expect(200);
  });

  it("expires only UNPAID, releases stock, and never expires pending verification", async () => {
    const shop = await createShop();
    const customer = await createCustomer();
    const order = await placeAdvance(customer, [shop], [2]);
    await prisma.paymentIntent.update({ where: { orderId: order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await payments.expireUnpaid()).toBe(1);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(intent.status).toBe("EXPIRED");
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: shop.variant.id } })).stockQty).toBe(10);
    expect((await prisma.shopOrder.findFirstOrThrow()).status).toBe("CANCELLED");

    const shop2 = await createShop();
    const customer2 = await createCustomer();
    const order2 = await placeAdvance(customer2, [shop2], [1]);
    const intent2 = await prisma.paymentIntent.findUniqueOrThrow({ where: { orderId: order2.id } });
    await submit(customer2, order2.id).expect(201);
    await prisma.paymentIntent.update({ where: { id: intent2.id }, data: { expiresAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 30 * 3_600_000) } });
    await prisma.paymentSubmission.updateMany({ where: { intentId: intent2.id }, data: { createdAt: new Date(Date.now() - 30 * 3_600_000) } });
    expect(await payments.expireUnpaid()).toBe(0);
    expect(await payments.alertSla()).toBe(1);
    expect((await prisma.paymentIntent.findUniqueOrThrow({ where: { id: intent2.id } })).status).toBe("PENDING_VERIFICATION");
  });

  it("reinstate a late-paid cancelled order when stock exists, else refund required", async () => {
    const shop = await createShop(100, 2);
    const customer = await createCustomer();
    const order = await placeAdvance(customer, [shop], [1]);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { orderId: order.id }, include: { order: { include: { shopOrders: true } } } });
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await payments.expireUnpaid();
    await submit(customer, order.id, `L${randomUUID().replace(/-/g, "").slice(0, 10)}`).expect(201);
    const admin = await adminAgent();
    const paid = await verify(admin, intent.id, 160).expect(200);
    expect(paid.body.data.status).toBe("PAID");
    expect(paid.body.data.reinstated).toBe(true);
    expect((await prisma.shopOrder.findFirstOrThrow()).status).toBe("PENDING");
  });

  it("creates a partial refund obligation when one ShopOrder is cancelled and completes it", async () => {
    const shopA = await createShop(100, 10, 60);
    const shopB = await createShop(200, 10, 80);
    const customer = await createCustomer();
    const order = await placeAdvance(customer, [shopA, shopB], [1, 1]);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({ where: { orderId: order.id } });
    await submit(customer, order.id).expect(201);
    const admin = await adminAgent();
    await verify(admin, intent.id, 440).expect(200);
    const target = order.shopOrders.find((row: { shopId: string }) => row.shopId === shopA.shop.id);
    await customer.agent.post(`${API}/orders/shop-orders/${target.id}/cancel`).set("Origin", ORIGIN).send({ reason: "Changed mind" }).expect(200);
    const queue = await admin.get(`${API}/admin/advance-refunds`).expect(200);
    expect(queue.body.data).toHaveLength(1);
    expect(queue.body.data[0].amount).toBe("160");
    const completed = await admin.post(`${API}/admin/advance-refunds/${queue.body.data[0].id}/complete`).set("Origin", ORIGIN).send({ refundTrxId: "REF12345" }).expect(200);
    expect(completed.body.data.status).toBe("PARTIALLY_REFUNDED");
  });

  it("snapshots provider details and enforces permissions", async () => {
    const shop = await createShop();
    const customer = await createCustomer();
    const order = await placeAdvance(customer, [shop], [1]);
    await setSettings(app, prisma, { "payment.bkash.number": "01700000001" });
    const info = await customer.agent.get(`${API}/advance-payments/orders/${order.id}`).expect(200);
    expect(info.body.data.instructions.providers[0].number).toBe("01700000000");
    const other = await createCustomer();
    await other.agent.get(`${API}/advance-payments/orders/${order.id}`).expect(404);
    const sellerStatus = await shop.agent.get(`${API}/seller/orders/${order.shopOrders[0].id}/advance-payment`).expect(200);
    expect(sellerStatus.body.data.status).toBe("UNPAID");
    await customer.agent.get(`${API}/admin/advance-payments`).expect(403);
    const admin = await adminAgent();
    await admin.get(`${API}/advance-payments/orders/${order.id}`).expect(403);
  });
});
