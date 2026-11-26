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
const PASSWORD = "Str0ngPass1!";

function suffix(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

describe("Product Q&A, replies & content reports (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let categoryId: string;
  let districtId: number;
  let shopId: string;
  let sellerUserId: string;
  let productId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(AppConfigService), { swagger: false, helmet: false, staticFiles: false });
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);

    const category = await prisma.category.create({
      data: { name: "Plants", slug: `plants-${suffix()}`, isActive: true },
    });
    categoryId = category.id;
    const district = await prisma.district.create({
      data: { name: `Dhaka-${suffix()}`, nameBn: "ঢাকা", division: "Dhaka" },
    });
    districtId = district.id;

    const seller = await createUser("SELLER");
    sellerUserId = seller.id;
    const profile = await prisma.sellerProfile.create({
      data: {
        userId: seller.id,
        businessName: "Green Valley",
        contactPhone: "01712345678",
        businessAddress: "x",
        status: "APPROVED",
        verifiedAt: new Date(),
      },
    });
    const shop = await prisma.shop.create({
      data: {
        sellerProfileId: profile.id,
        name: "Green Valley",
        slug: `green-${suffix()}`,
        status: "ACTIVE",
        approvedAt: new Date(),
      },
    });
    shopId = shop.id;
    const product = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        name: "Monstera",
        slug: `monstera-${suffix()}`,
        description: "x",
        status: "ACTIVE",
        publishedAt: new Date(),
        minPrice: "500",
        maxPrice: "500",
        inStock: true,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function createUser(role: "CUSTOMER" | "SELLER" | "ADMIN", verified = true) {
    return prisma.user.create({
      data: {
        email: `u_${suffix()}@example.com`,
        name: `${role} ${suffix()}`,
        passwordHash: await hashPassword(PASSWORD),
        role,
        emailVerifiedAt: verified ? new Date() : null,
      },
    });
  }

  async function login(email: string) {
    const agent = request.agent(server);
    await agent
      .post(`${API}/auth/login`)
      .send({ email, password: PASSWORD })
      .set("Origin", ORIGIN)
      .expect(200);
    return agent;
  }

  async function verifiedCustomerAgent() {
    const user = await createUser("CUSTOMER");
    return { user, agent: await login(user.email) };
  }

  it("lets anyone read Q&A but only verified users post", async () => {
    const product = await prisma.product.create({
      data: {
        shopId,
        categoryId,
        name: `P ${suffix()}`,
        slug: `p-${suffix()}`,
        description: "x",
        status: "ACTIVE",
        inStock: true,
      },
    });

    const empty = await request(server)
      .get(`${API}/products/${product.slug}/questions`)
      .expect(200);
    expect(empty.body.data).toEqual([]);

    // anonymous
    await request(server)
      .post(`${API}/products/${product.id}/questions`)
      .set("Origin", ORIGIN)
      .send({ body: "Is this pet safe to keep indoors?" })
      .expect(401);

    // unverified
    const unverified = await createUser("CUSTOMER", false);
    const unverifiedAgent = await login(unverified.email);
    const denied = await unverifiedAgent
      .post(`${API}/products/${product.id}/questions`)
      .set("Origin", ORIGIN)
      .send({ body: "Is this pet safe to keep indoors?" })
      .expect(403);
    expect(denied.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("asks, guards duplicates/rate/own-product, answers and notifies", async () => {
    const product = await prisma.product.create({
      data: {
        shopId,
        categoryId,
        name: `P ${suffix()}`,
        slug: `p-${suffix()}`,
        description: "x",
        status: "ACTIVE",
        inStock: true,
      },
    });
    const { user: asker, agent } = await verifiedCustomerAgent();

    const asked = await agent
      .post(`${API}/products/${product.id}/questions`)
      .set("Origin", ORIGIN)
      .send({ body: "How often should I water this plant?" })
      .expect(201);
    const questionId = asked.body.data.id as string;

    // html stripped
    const stripped = await agent
      .post(`${API}/products/${product.id}/questions`)
      .set("Origin", ORIGIN)
      .send({ body: "<b>Does it</b> like shade? <script>x</script>" })
      .expect(201);
    expect(stripped.body.data.body).toBe("Does it like shade?");

    // duplicate within 24h
    await agent
      .post(`${API}/products/${product.id}/questions`)
      .set("Origin", ORIGIN)
      .send({ body: "How often should I water this plant?" })
      .expect(409);

    // rate limit: 5 questions/hour (we already asked 2)
    for (let i = 0; i < 3; i++) {
      await agent
        .post(`${API}/products/${product.id}/questions`)
        .set("Origin", ORIGIN)
        .send({ body: `Rate question ${i} about care ${suffix()}` })
        .expect(201);
    }
    const limited = await agent
      .post(`${API}/products/${product.id}/questions`)
      .set("Origin", ORIGIN)
      .send({ body: `Rate question overflow ${suffix()}` })
      .expect(422);
    expect(limited.body.error.code).toBe("TOO_MANY_REQUESTS");

    // shop owner cannot ask on their own product
    await login((await prisma.user.findUniqueOrThrow({ where: { id: sellerUserId } })).email)
      .then((agent) =>
        agent
          .post(`${API}/products/${product.id}/questions`)
          .set("Origin", ORIGIN)
          .send({ body: "Can I ask about my own product?" })
          .expect(403),
      );

    // shop owner got QUESTION_ASKED
    expect(
      await prisma.notification.count({ where: { userId: sellerUserId, type: "QUESTION_ASKED" } }),
    ).toBeGreaterThan(0);

    // seller answers
    const sellerAgent = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: sellerUserId } })).email,
    );
    const answered = await sellerAgent
      .post(`${API}/questions/${questionId}/answers`)
      .set("Origin", ORIGIN)
      .send({ body: "Water once a week and keep the soil slightly damp." })
      .expect(201);
    expect(answered.body.data.isSellerAnswer).toBe(true);
    const answerId = answered.body.data.id as string;

    // asker notified
    expect(
      await prisma.notification.count({ where: { userId: asker.id, type: "QUESTION_ANSWERED" } }),
    ).toBeGreaterThan(0);

    // another verified customer replies to the answer
    const { user: replier, agent: replierAgent } = await verifiedCustomerAgent();
    const replied = await replierAgent
      .post(`${API}/answers/${answerId}/replies`)
      .set("Origin", ORIGIN)
      .send({ body: "Thanks, that helped!" })
      .expect(201);
    expect(replied.body.data.isSellerReply).toBe(false);

    // seller got REPLY_RECEIVED for their answer
    expect(
      await prisma.notification.count({ where: { userId: sellerUserId, type: "REPLY_RECEIVED" } }),
    ).toBeGreaterThan(0);
    expect(replier.id).toBeTruthy();
  });

  it("walks question/answer/reply cursors without duplicates", async () => {
    const product = await prisma.product.create({
      data: {
        shopId,
        categoryId,
        name: `P ${suffix()}`,
        slug: `p-${suffix()}`,
        description: "x",
        status: "ACTIVE",
        inStock: true,
      },
    });
    const { agent } = await verifiedCustomerAgent();
    const created: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await agent
        .post(`${API}/products/${product.id}/questions`)
        .set("Origin", ORIGIN)
        .send({ body: `Cursor question number ${i} ${suffix()}` })
        .expect(201);
      created.push(res.body.data.id);
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ limit: "1" });
      if (cursor) params.set("cursor", cursor);
      const page = await request(server)
        .get(`${API}/products/${product.slug}/questions?${params}`)
        .expect(200);
      seen.push(...(page.body.data as { id: string }[]).map((row) => row.id));
      cursor = (page.body.meta.nextCursor as string | null) ?? undefined;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(new Set(seen)).toEqual(new Set(created));

    const bad = await request(server)
      .get(`${API}/products/${product.slug}/questions?cursor=!!!`)
      .expect(400);
    expect(bad.body.error.code).toBe("INVALID_CURSOR");
  });

  it("supports reporting, the admin queue and hiding content", async () => {
    const product = await prisma.product.create({
      data: {
        shopId,
        categoryId,
        name: `P ${suffix()}`,
        slug: `p-${suffix()}`,
        description: "x",
        status: "ACTIVE",
        inStock: true,
      },
    });
    const { agent } = await verifiedCustomerAgent();
    const asked = await agent
      .post(`${API}/products/${product.id}/questions`)
      .set("Origin", ORIGIN)
      .send({ body: "Is this question going to be reported?" })
      .expect(201);
    const questionId = asked.body.data.id as string;

    const { agent: reporterAgent } = await verifiedCustomerAgent();
    const report = await reporterAgent
      .post(`${API}/questions/${questionId}/report`)
      .set("Origin", ORIGIN)
      .send({ reason: "Spam content here" })
      .expect(201);
    const reportId = report.body.data.id as string;
    expect(report.body.data.targetType).toBe("QUESTION");

    const admin = await createUser("ADMIN");
    const adminAgent = await login(admin.email);
    const queue = await adminAgent
      .get(`${API}/admin/content-reports?targetType=QUESTION&status=OPEN`)
      .expect(200);
    expect((queue.body.data as { id: string }[]).some((row) => row.id === reportId)).toBe(true);

    await adminAgent
      .post(`${API}/admin/content-reports/${reportId}/resolve`)
      .set("Origin", ORIGIN)
      .send({ hide: true })
      .expect(200);

    const afterHide = await request(server)
      .get(`${API}/products/${product.slug}/questions`)
      .expect(200);
    expect((afterHide.body.data as { id: string }[]).some((row) => row.id === questionId)).toBe(
      false,
    );
    const audit = await prisma.auditLog.count({ where: { action: "content.hide", entityId: questionId } });
    expect(audit).toBeGreaterThan(0);
  });

  it("gives sellers their unanswered questions and dashboard count", async () => {
    const product = await prisma.product.create({
      data: {
        shopId,
        categoryId,
        name: `P ${suffix()}`,
        slug: `p-${suffix()}`,
        description: "x",
        status: "ACTIVE",
        inStock: true,
      },
    });
    const { agent } = await verifiedCustomerAgent();
    await agent
      .post(`${API}/products/${product.id}/questions`)
      .set("Origin", ORIGIN)
      .send({ body: "Unanswered question for the seller queue?" })
      .expect(201);

    const sellerAgent = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: sellerUserId } })).email,
    );
    const list = await sellerAgent
      .get(`${API}/seller/questions?status=unanswered`)
      .expect(200);
    expect((list.body.data as unknown[]).length).toBeGreaterThan(0);

    const dashboard = await sellerAgent.get(`${API}/seller/dashboard`).expect(200);
    expect(dashboard.body.data.unansweredQuestions).toBeGreaterThan(0);
  });

  it("pages reviews with cursor + distribution, filters and deleted authors", async () => {
    const product = await prisma.product.create({
      data: {
        shopId,
        categoryId,
        name: `P ${suffix()}`,
        slug: `p-${suffix()}`,
        description: "x",
        status: "ACTIVE",
        inStock: true,
      },
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${suffix()}`,
        customerId: (await createUser("CUSTOMER")).id,
        contactName: "C",
        contactPhone: "01712345678",
        shippingDistrictId: districtId,
        shippingDistrictName: "Dhaka",
        shippingArea: "Mirpur",
        shippingAddressLine: "House 1",
        paymentMethod: "COD",
        subtotal: "1000",
        deliveryTotal: "60",
        grandTotal: "1060",
      },
    });
    const shopOrder = await prisma.shopOrder.create({
      data: {
        shopOrderNumber: `SO-${suffix()}`,
        orderId: order.id,
        shopId,
        status: "DELIVERED",
        subtotal: "1000",
        deliveryCharge: "60",
        total: "1060",
        commissionAmount: "100",
        sellerNetAmount: "900",
        deliveredAt: new Date(),
      },
    });

    const pid = product.id;
    async function addReview(rating: number, withImage: boolean) {
      const customer = await createUser("CUSTOMER");
      const item = await prisma.orderItem.create({
        data: {
          shopOrderId: shopOrder.id,
          productId: pid,
          productName: "Monstera",
          variantName: "Standard",
          unitPrice: "1000",
          quantity: 1,
          lineTotal: "1000",
          commissionRate: "10",
          commissionAmount: "100",
        },
      });
      return prisma.review.create({
        data: {
          productId: pid,
          shopId,
          customerId: customer.id,
          orderItemId: item.id,
          rating,
          comment: `Rating ${rating}`,
          images: withImage ? { create: [{ url: "https://cdn.test/a.webp" }] } : undefined,
        },
      });
    }
    await addReview(5, true);
    await addReview(3, false);
    const deletedAuthor = await createUser("CUSTOMER");
    const item = await prisma.orderItem.create({
      data: {
        shopOrderId: shopOrder.id,
        productId: pid,
        productName: "Monstera",
        variantName: "Standard",
        unitPrice: "1000",
        quantity: 1,
        lineTotal: "1000",
        commissionRate: "10",
        commissionAmount: "100",
      },
    });
    await prisma.review.create({
      data: { productId: pid, shopId, customerId: deletedAuthor.id, orderItemId: item.id, rating: 1 },
    });
    await prisma.user.update({ where: { id: deletedAuthor.id }, data: { deletedAt: new Date() } });

    const first = await request(server)
      .get(`${API}/products/${product.slug}/reviews?pagination=cursor&limit=2&sort=highest`)
      .expect(200);
    expect(first.body.meta.distribution).toEqual({ "1": 1, "2": 0, "3": 1, "4": 0, "5": 1 });
    expect(first.body.meta.average).toBe(3);
    const ratings = (first.body.data as { rating: number }[]).map((row) => row.rating);
    expect(ratings).toEqual([5, 3]);
    expect(typeof first.body.meta.nextCursor).toBe("string");

    const withPhotos = await request(server)
      .get(`${API}/products/${product.slug}/reviews?withPhotos=true`)
      .expect(200);
    expect((withPhotos.body.data as unknown[]).length).toBe(1);

    const oneStar = await request(server)
      .get(`${API}/products/${product.slug}/reviews?rating=1`)
      .expect(200);
    expect((oneStar.body.data as { customer: { deleted: boolean } }[])[0].customer.deleted).toBe(
      true,
    );

    // pagination continues without duplicates
    const second = await request(server)
      .get(
        `${API}/products/${product.slug}/reviews?pagination=cursor&limit=2&sort=highest&cursor=${first.body.meta.nextCursor}`,
      )
      .expect(200);
    expect((second.body.data as { rating: number }[]).map((row) => row.rating)).toEqual([1]);
  });

  it("keeps the old seller-review reply endpoint working via Reply rows", async () => {
    const customer = await createUser("CUSTOMER");
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${suffix()}`,
        customerId: customer.id,
        contactName: "C",
        contactPhone: "01712345678",
        shippingDistrictId: districtId,
        shippingDistrictName: "Dhaka",
        shippingArea: "Mirpur",
        shippingAddressLine: "House 1",
        paymentMethod: "COD",
        subtotal: "100",
        deliveryTotal: "60",
        grandTotal: "160",
      },
    });
    const shopOrder = await prisma.shopOrder.create({
      data: {
        shopOrderNumber: `SO-${suffix()}`,
        orderId: order.id,
        shopId,
        status: "DELIVERED",
        subtotal: "100",
        deliveryCharge: "60",
        total: "160",
        commissionAmount: "10",
        sellerNetAmount: "90",
        deliveredAt: new Date(),
      },
    });
    const item = await prisma.orderItem.create({
      data: {
        shopOrderId: shopOrder.id,
        productId,
        productName: "Monstera",
        variantName: "Standard",
        unitPrice: "100",
        quantity: 1,
        lineTotal: "100",
        commissionRate: "10",
        commissionAmount: "10",
      },
    });
    const review = await prisma.review.create({
      data: { productId, shopId, customerId: customer.id, orderItemId: item.id, rating: 4 },
    });

    const sellerAgent = await login(
      (await prisma.user.findUniqueOrThrow({ where: { id: sellerUserId } })).email,
    );
    await sellerAgent
      .post(`${API}/seller/reviews/${review.id}/reply`)
      .set("Origin", ORIGIN)
      .send({ reply: "Thank you for your feedback!" })
      .expect(200);

    const reply = await prisma.reply.findFirst({
      where: { reviewId: review.id, isSellerReply: true },
    });
    expect(reply?.body).toBe("Thank you for your feedback!");

    const publicReplies = await request(server)
      .get(`${API}/reviews/${review.id}/replies`)
      .expect(200);
    expect((publicReplies.body.data as unknown[]).length).toBe(1);
  });

  it("migrates refund/report storage to ContentReport and rejects stray ReviewReport rows", async () => {
    // ContentReport is the single report store.
    const count = await prisma.contentReport.count();
    expect(count).toBeGreaterThanOrEqual(0);
    // A random uuid id is rejected for reports of unknown targets.
    const { agent } = await verifiedCustomerAgent();
    await agent
      .post(`${API}/questions/${randomUUID()}/report`)
      .set("Origin", ORIGIN)
      .send({ reason: "Unknown target" })
      .expect(404);
  });
});
