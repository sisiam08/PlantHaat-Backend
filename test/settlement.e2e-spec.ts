import { randomUUID } from "node:crypto";

import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { hashPassword } from "../src/common/utils/password";
import { AppConfigService } from "../src/config/app-config.service";
import { Prisma } from "../src/generated/prisma/client";
import { LedgerService } from "../src/modules/ledger/ledger.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./cleanup";
import { clearSettings, setSettings } from "./settings-test-helper";

const API = "/api/v1";
const ORIGIN = "http://localhost:3000";

describe("Settlement ledger, release, disputes and withdrawals (real DB)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let ledger: LedgerService;
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
    ledger = app.get(LedgerService);
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
      "return.windowHours": 48,
      "return.photoRequired": true,
      "return.earlyRelease": true,
      "wallet.codCommissionDeduct": true,
      "wallet.codDuesLimit": 1000,
      "payout.minimumAmount": 500,
      "payout.maxPendingRequests": 3,
      "payout.methods": ["BKASH", "NAGAD", "BANK"],
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

  async function createShop(price = 1000, charge = 60, stock = 10) {
    const id = randomUUID();
    const email = `seller_${id.slice(0, 8)}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        name: "Seller",
        passwordHash: await hashPassword("SellerPass1"),
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
      },
    });
    await prisma.shopDeliveryZone.create({
      data: { shopId: shop.id, name: "Zone", charge, districts: { create: [{ districtId }] } },
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
    const agent = request.agent(server);
    await agent.post(`${API}/auth/login`).send({ email, password: "SellerPass1" }).expect(200);
    return { user, profile, shop, product, variant, agent };
  }

  async function createCustomer() {
    const agent = request.agent(server);
    const email = `cust_${randomUUID().slice(0, 12)}@example.com`;
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

  async function adminAgent() {
    const email = `admin_${randomUUID().slice(0, 8)}@example.com`;
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

  async function advanceOrder(shops: Awaited<ReturnType<typeof createShop>>[]) {
    const customer = await createCustomer();
    for (const shop of shops) {
      await customer.agent
        .put(`${API}/cart/items`)
        .set("Origin", ORIGIN)
        .send({ variantId: shop.variant.id, quantity: 1 })
        .expect(200);
    }
    const order = await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ addressId: customer.addressId, paymentMethod: "ADVANCE" })
      .expect(200);
    const intent = await prisma.paymentIntent.findUniqueOrThrow({
      where: { orderId: order.body.data.id },
    });
    const trxId = `T${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    await customer.agent
      .post(`${API}/advance-payments/orders/${order.body.data.id}/submissions`)
      .set("Origin", ORIGIN)
      .send({ provider: "BKASH", trxId, senderNumber: "01712345678" })
      .expect(201);
    const admin = await adminAgent();
    await admin
      .post(`${API}/admin/advance-payments/${intent.id}/verify`)
      .set("Origin", ORIGIN)
      .send({ amountReceived: Number(intent.amountDue) })
      .expect(200);
    return { customer, order: order.body.data, intent, admin };
  }

  async function deliver(seller: Awaited<ReturnType<typeof createShop>>, shopOrderId: string) {
    for (const status of ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"]) {
      await seller.agent
        .post(`${API}/seller/orders/${shopOrderId}/status`)
        .set("Origin", ORIGIN)
        .send({ status })
        .expect(200);
    }
  }

  it("holds advance funds, releases after the window and pays a withdrawal", async () => {
    const seller = await createShop(1000, 60);
    const { customer, order, admin } = await advanceOrder([seller]);
    const shopOrderId = order.shopOrders[0].id as string;

    const receipt = await prisma.ledgerEntry.findMany({ where: { type: "PAYMENT_RECEIVED" } });
    expect(receipt).toHaveLength(2);
    expect(await ledger.reconcile()).toMatchObject({ balanced: true, receipts: "1060.00" });

    await deliver(seller, shopOrderId);
    const delivered = await prisma.shopOrder.findUniqueOrThrow({ where: { id: shopOrderId } });
    expect(delivered.releaseAt).not.toBeNull();
    const expected = delivered.deliveredAt!.getTime() + 48 * 3_600_000;
    expect(delivered.releaseAt!.getTime()).toBe(expected);

    let balances = await ledger.balances(seller.profile.id);
    expect(balances.pending.toFixed(2)).toBe("960.00");
    expect(balances.available.toFixed(2)).toBe("0.00");
    expect((await ledger.reconcile()).balanced).toBe(true);

    // Changing the window afterwards must not move an existing release time.
    await setSettings(app, prisma, { "return.windowHours": 24 });
    const unchanged = await prisma.shopOrder.findUniqueOrThrow({ where: { id: shopOrderId } });
    expect(unchanged.releaseAt!.getTime()).toBe(expected);
    await setSettings(app, prisma, { "return.windowHours": 48 });

    // Boundary: one minute before the window must not release; 48h01 must.
    expect((await ledger.releaseDue(new Date(expected - 60_000))).released).toBe(0);
    expect((await ledger.releaseDue(new Date(expected + 60_000))).released).toBe(1);
    expect((await ledger.releaseDue(new Date(expected + 120_000))).released).toBe(0);
    balances = await ledger.balances(seller.profile.id);
    expect(balances.available.toFixed(2)).toBe("960.00");
    expect(balances.pending.toFixed(2)).toBe("0.00");

    await seller.agent
      .put(`${API}/seller/wallet/payout-profile`)
      .set("Origin", ORIGIN)
      .send({ method: "BKASH", accountNumber: "01712345678", accountName: "Seller" })
      .expect(200);
    const withdrawal = await seller.agent
      .post(`${API}/seller/wallet/withdrawals`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ amount: 600 })
      .expect(201);
    expect(withdrawal.body.data.status).toBe("PENDING");
    balances = await ledger.balances(seller.profile.id);
    expect(balances.available.toFixed(2)).toBe("360.00");
    expect(balances.withdrawalReserved.toFixed(2)).toBe("600.00");
    const revealId = withdrawal.body.data.id as string;
    await seller.agent
      .post(`${API}/admin/withdrawals/${revealId}/destination`)
      .set("Origin", ORIGIN)
      .expect(403);
    await admin
      .post(`${API}/admin/withdrawals/${revealId}/destination`)
      .set("Origin", ORIGIN)
      .expect(400);
    const reauth = await admin
      .post(`${API}/admin/settings/reauth`)
      .set("Origin", ORIGIN)
      .send({
        keys: [`withdrawal.destination:${revealId}`],
        password: "AdminStr0ng1",
      })
      .expect(200);
    const revealed = await admin
      .post(`${API}/admin/withdrawals/${revealId}/destination`)
      .set("Origin", ORIGIN)
      .set("x-settings-reauth", reauth.body.data.token as string)
      .expect(200);
    expect(revealed.body.data.accountNumber).toBe("01712345678");
    const list = await admin.get(`${API}/admin/withdrawals`).expect(200);
    expect(JSON.stringify(list.body.data)).not.toContain("01712345678");
    const audit = await prisma.auditLog.findFirst({
      where: { action: "withdrawal.destination_revealed", entityId: revealId },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit)).not.toContain("01712345678");
    // Re-auth token is single-use: the second reveal must fail.
    await admin
      .post(`${API}/admin/withdrawals/${revealId}/destination`)
      .set("Origin", ORIGIN)
      .set("x-settings-reauth", reauth.body.data.token as string)
      .expect(400);


    await admin
      .post(`${API}/admin/withdrawals/${withdrawal.body.data.id}/pay`)
      .set("Origin", ORIGIN)
      .send({ reference: "BKASH-REF-1" })
      .expect(200);
    balances = await ledger.balances(seller.profile.id);
    expect(balances.totalWithdrawn.toFixed(2)).toBe("600.00");
    expect(balances.withdrawalReserved.toFixed(2)).toBe("0.00");
    expect((await ledger.reconcile()).balanced).toBe(true);

    const wallet = await seller.agent.get(`${API}/seller/wallet`).expect(200);
    expect(wallet.body.data.balances.available).toBe("360.00");
    expect(customer.userId).toBeTruthy();
  });

  it("releases early when the buyer confirms everything is fine", async () => {
    const seller = await createShop(1000, 60);
    const { customer, order } = await advanceOrder([seller]);
    const shopOrderId = order.shopOrders[0].id as string;
    await deliver(seller, shopOrderId);
    await customer.agent
      .post(`${API}/orders/shop-orders/${shopOrderId}/confirm-receipt`)
      .set("Origin", ORIGIN)
      .expect(200);
    const balances = await ledger.balances(seller.profile.id);
    expect(balances.available.toFixed(2)).toBe("960.00");
    expect(balances.pending.toFixed(2)).toBe("0.00");
  });

  it("allocates awkward multi-shop totals without losing a minor unit", async () => {
    const first = await createShop(333.33, 60);
    const second = await createShop(333.34, 60);
    const { order } = await advanceOrder([first, second]);
    const allocations = await prisma.paymentIntentAllocation.findMany({
      where: { intent: { orderId: order.id } },
    });
    const sum = allocations.reduce(
      (total, row) => total.plus(row.amount),
      new Prisma.Decimal(0),
    );
    expect(sum.toFixed(2)).toBe(Number(order.grandTotal).toFixed(2));
    expect(allocations).toHaveLength(2);
  });

  it("keeps funds on hold when a dispute wins the race and never double-posts", async () => {    const seller = await createShop(1000, 60);
    for (let run = 0; run < 3; run += 1) {
      const { customer, order } = await advanceOrder([seller]);
      const shopOrderId = order.shopOrders[0].id as string;
      await deliver(seller, shopOrderId);
      await prisma.shopOrder.update({
        where: { id: shopOrderId },
        data: { releaseAt: new Date(Date.now() - 1000) },
      });
      const [complaintResult] = await Promise.allSettled([
        customer.agent
          .post(`${API}/complaints`)
          .set("Origin", ORIGIN)
          .send({
            shopOrderId,
            type: "DAMAGED_PLANT",
            description: "The plant arrived damaged in the box",
            attachments: ["/uploads/disputes/evidence.webp"],
          }),
        ledger.releaseDue(new Date()),
      ]);
      const complaint = (
        complaintResult.status === "fulfilled" ? complaintResult.value : undefined
      ) as { status?: number; body?: { data?: { id: string } } } | undefined;
      expect(complaint?.status).toBe(201);
      const balances = await ledger.balances(seller.profile.id);
      expect(balances.pending.toFixed(2)).toBe("0.00");
      expect(balances.onHold.toFixed(2)).toBe((960 * (run + 1)).toFixed(2));
      expect(balances.available.toFixed(2)).toBe("0.00");
      expect((await ledger.reconcile()).balanced).toBe(true);
      expect(
        await prisma.ledgerEntry.count({ where: { type: "DISPUTE_HOLD" } }),
      ).toBe((run + 1) * 2);
    }
  }, 180000);

  it("serializes parallel withdrawals so the available balance is never overdrawn", async () => {
    const seller = await createShop(1000, 60);
    const { order } = await advanceOrder([seller]);
    const shopOrderId = order.shopOrders[0].id as string;
    await deliver(seller, shopOrderId);
    await prisma.shopOrder.update({
      where: { id: shopOrderId },
      data: { releaseAt: new Date(Date.now() - 1000) },
    });
    await ledger.releaseDue();
    await seller.agent
      .put(`${API}/seller/wallet/payout-profile`)
      .set("Origin", ORIGIN)
      .send({ method: "BKASH", accountNumber: "01712345678", accountName: "Seller" })
      .expect(200);

    const [a, b] = await Promise.all([
      seller.agent
        .post(`${API}/seller/wallet/withdrawals`)
        .set("Origin", ORIGIN)
        .set("Idempotency-Key", randomUUID())
        .send({ amount: 600 }),
      seller.agent
        .post(`${API}/seller/wallet/withdrawals`)
        .set("Origin", ORIGIN)
        .set("Idempotency-Key", randomUUID())
        .send({ amount: 600 }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 422]);
    const balances = await ledger.balances(seller.profile.id);
    expect(balances.withdrawalReserved.toFixed(2)).toBe("600.00");
    expect(balances.available.toFixed(2)).toBe("360.00");
  });

  it("accrues COD dues, blocks withdrawals above the limit and clears a manual payment", async () => {
    const seller = await createShop(1000, 60);
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
    await deliver(seller, shopOrderId);
    let balances = await ledger.balances(seller.profile.id);
    expect(balances.codDues.toFixed(2)).toBe("100.00");
    expect(balances.pending.toFixed(2)).toBe("0.00");
    // The platform never receives COD cash.
    expect(await prisma.ledgerEntry.count({ where: { account: "BUYER_RECEIPTS" } })).toBe(0);

    await setSettings(app, prisma, { "wallet.codDuesLimit": 50 });
    await seller.agent
      .put(`${API}/seller/wallet/payout-profile`)
      .set("Origin", ORIGIN)
      .send({ method: "BKASH", accountNumber: "01712345678", accountName: "Seller" })
      .expect(200);
    const blocked = await seller.agent
      .post(`${API}/seller/wallet/withdrawals`)
      .set("Origin", ORIGIN)
      .send({ amount: 500 });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("PAYOUT_COD_DUES_BLOCKED");

    const admin = await adminAgent();
    await admin
      .post(`${API}/admin/sellers/${seller.profile.id}/dues-payments`)
      .set("Origin", ORIGIN)
      .send({ amount: 100, reference: "DUES-TRX-1" })
      .expect(200);
    balances = await ledger.balances(seller.profile.id);
    expect(balances.codDues.toFixed(2)).toBe("0.00");
  });

  it("decides disputes: full refund posts refunds paid, reject returns funds", async () => {
    const seller = await createShop(1000, 60);
    const refundCase = await advanceOrder([seller]);
    const refundOrderId = refundCase.order.shopOrders[0].id as string;
    await deliver(seller, refundOrderId);
    const opened = await refundCase.customer.agent
      .post(`${API}/complaints`)
      .set("Origin", ORIGIN)
      .send({
        shopOrderId: refundOrderId,
        type: "DAMAGED_PLANT",
        description: "The plant arrived damaged in the box",
        attachments: ["/uploads/disputes/evidence.webp"],
      })
      .expect(201);
    await refundCase.admin
      .post(`${API}/admin/complaints/${opened.body.data.id}/decision`)
      .set("Origin", ORIGIN)
      .send({
        decision: "REFUND_FULL",
        reason: "Photos confirm damage",
        refundTrxId: "BKASHREF1234",
      })
      .expect(200);
    const duplicateDecision = await refundCase.admin
      .post(`${API}/admin/complaints/${opened.body.data.id}/decision`)
      .set("Origin", ORIGIN)
      .send({ decision: "REJECTED", reason: "Stale tab replay" });
    expect(duplicateDecision.status).toBe(409);
    expect(duplicateDecision.body.error.code).toBe("DISPUTE_INVALID_STATE");
    const filtered = await refundCase.admin
      .get(`${API}/admin/complaints`)
      .query({
        seller: seller.profile.businessName,
        status: "RESOLVED_REFUND",
        minAgeHours: 0,
        maxAgeHours: 24,
        minAmount: 1,
        maxAmount: 100000,
      })
      .expect(200);
    expect(filtered.body.data.some((row: { id: string }) => row.id === opened.body.data.id)).toBe(
      true,
    );

    let balances = await ledger.balances(seller.profile.id);
    expect(balances.onHold.toFixed(2)).toBe("0.00");
    expect(balances.pending.toFixed(2)).toBe("0.00");
    expect((await ledger.reconcile()).balanced).toBe(true);
    expect(
      (await ledger.reconcile()).accounts["REFUNDS_PAID"]?.toFixed(2),
    ).toBe("1060.00");
    expect(
      (await prisma.complaint.findUniqueOrThrow({ where: { id: opened.body.data.id } }))
        .status,
    ).toBe("RESOLVED_REFUND");

    const rejectCase = await advanceOrder([seller]);
    const rejectOrderId = rejectCase.order.shopOrders[0].id as string;
    await deliver(seller, rejectOrderId);
    const rejected = await rejectCase.customer.agent
      .post(`${API}/complaints`)
      .set("Origin", ORIGIN)
      .send({
        shopOrderId: rejectOrderId,
        type: "WRONG_ITEM",
        description: "The delivered plant is a different variety",
        attachments: ["/uploads/disputes/evidence.webp"],
      })
      .expect(201);
    await rejectCase.admin
      .post(`${API}/admin/complaints/${rejected.body.data.id}/decision`)
      .set("Origin", ORIGIN)
      .send({ decision: "REJECTED", reason: "Evidence does not match" })
      .expect(200);
    balances = await ledger.balances(seller.profile.id);
    expect(balances.onHold.toFixed(2)).toBe("0.00");
    expect(balances.pending.toFixed(2)).toBe("960.00");
    await prisma.shopOrder.update({
      where: { id: rejectOrderId },
      data: { releaseAt: new Date(Date.now() - 1000) },
    });
    await ledger.releaseDue();
    balances = await ledger.balances(seller.profile.id);
    expect(balances.available.toFixed(2)).toBe("960.00");
    expect((await ledger.reconcile()).balanced).toBe(true);
  }, 120000);

  it("denies cross-role access to wallet, payout and dispute decisions", async () => {
    const seller = await createShop();
    const customer = await createCustomer();
    await customer.agent.get(`${API}/seller/wallet`).expect(403);
    await seller.agent.get(`${API}/admin/withdrawals`).expect(403);
    await customer.agent
      .post(`${API}/admin/complaints/00000000-0000-0000-0000-000000000000/decision`)
      .set("Origin", ORIGIN)
      .send({ decision: "REJECTED", reason: "test" })
      .expect(403);
  });
});
