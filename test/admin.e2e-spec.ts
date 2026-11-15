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

const API = "/api/v1";
const ORIGIN = "http://localhost:3000";

function suffix(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

describe("Admin, content, announcements & analytics (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

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
  });

  afterEach(async () => {
    await clearSettings(app, prisma);
  });

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

  it("reads and updates system settings", async () => {
    const admin = await adminAgent();
    const before = await admin.get(`${API}/admin/settings`).expect(200);
    expect(before.body.data["commission.default"]).toBe(10);

    await admin
      .patch(`${API}/admin/settings`)
      .set("Origin", ORIGIN)
      .send({ values: { "commission.default": 12 } })
      .expect(400);

    const reauth = await admin
      .post(`${API}/admin/settings/reauth`)
      .set("Origin", ORIGIN)
      .send({ key: "commission.default", password: "AdminStr0ng1" })
      .expect(200);
    const after = await admin
      .patch(`${API}/admin/settings`)
      .set("Origin", ORIGIN)
      .set("x-settings-reauth", reauth.body.data.token)
      .send({ values: { "commission.default": 12 } })
      .expect(200);
    expect(after.body.data["commission.default"]).toBe(12);

    await admin
      .patch(`${API}/admin/settings`)
      .set("Origin", ORIGIN)
      .send({ values: { "unknown.key": 1 } })
      .expect(400);
  });

  it("enforces settings access and public-key isolation", async () => {
    const customerEmail = `customer_${suffix()}@example.com`;
    await prisma.user.create({
      data: {
        email: customerEmail,
        name: "Customer",
        passwordHash: await hashPassword("Customer1"),
        role: "CUSTOMER",
        emailVerifiedAt: new Date(),
      },
    });
    const customer = request.agent(server);
    await customer.post(`${API}/auth/login`).send({ email: customerEmail, password: "Customer1" }).expect(200);
    await customer.get(`${API}/admin/settings`).expect(403);
    await customer.get(`${API}/admin/settings/registry`).expect(403);
    await customer.get(`${API}/admin/settings/history`).expect(403);
    await customer.patch(`${API}/admin/settings`).set("Origin", ORIGIN).send({ values: {} }).expect(403);

    const publicRes = await request(server).get(`${API}/settings/public`).expect(200);
    const keys = Object.keys(publicRes.body.data);
    expect(keys).toContain("payment.advance.enabled");
    for (const privateKey of [
      "payment.bkash.number",
      "payment.nagad.number",
      "commission.default",
      "wallet.codDuesLimit",
      "payout.minimumAmount",
      "payout.methods",
    ]) expect(keys).not.toContain(privateKey);
  });

  it("manages categories and content", async () => {
    const admin = await adminAgent();

    const category = await admin
      .post(`${API}/admin/categories`)
      .set("Origin", ORIGIN)
      .send({ name: "Bonsai" })
      .expect(201);
    expect(category.body.data.slug).toContain("bonsai");

    const listed = await admin.get(`${API}/admin/categories`).expect(200);
    expect(listed.body.data).toHaveLength(1);

    await admin
      .delete(`${API}/admin/categories/${category.body.data.id}`)
      .set("Origin", ORIGIN)
      .expect(204);

    const banner = await admin
      .post(`${API}/admin/banners`)
      .set("Origin", ORIGIN)
      .send({ imageUrl: "https://cdn.test/hero.webp", title: "Eid sale" })
      .expect(201);
    await admin
      .patch(`${API}/admin/banners/${banner.body.data.id}`)
      .set("Origin", ORIGIN)
      .send({ isActive: false })
      .expect(200);

    await admin
      .post(`${API}/admin/homepage-sections`)
      .set("Origin", ORIGIN)
      .send({ key: "featured", title: "Featured", type: "FEATURED_PRODUCTS", itemIds: [] })
      .expect(201);
    const sections = await admin.get(`${API}/admin/homepage-sections`).expect(200);
    expect(sections.body.data).toHaveLength(1);
  });

  it("fans out an announcement to the selected audience", async () => {
    const admin = await adminAgent();
    const customerEmail = `cust_${suffix()}@example.com`;
    const customer = await prisma.user.create({
      data: {
        email: customerEmail,
        name: "Customer",
        passwordHash: await hashPassword("Str0ngPass1"),
        role: "CUSTOMER",
        emailVerifiedAt: new Date(),
      },
    });

    await admin
      .post(`${API}/admin/announcements`)
      .set("Origin", ORIGIN)
      .send({ title: "Welcome", body: "New plants added!", audience: "CUSTOMERS" })
      .expect(201);

    const count = await prisma.notification.count({
      where: { userId: customer.id, type: "ANNOUNCEMENT" },
    });
    expect(count).toBe(1);
  });

  it("creates, lists and suspends users", async () => {
    const admin = await adminAgent();
    const created = await admin
      .post(`${API}/admin/users`)
      .set("Origin", ORIGIN)
      .send({ email: `admin2_${suffix()}@example.com`, password: "Str0ngPass1", name: "Admin 2" })
      .expect(201);
    expect(created.body.data.role).toBe("ADMIN");

    const users = await admin.get(`${API}/admin/users?role=ADMIN`).expect(200);
    expect(users.body.data.length).toBeGreaterThanOrEqual(2);

    const victim = await prisma.user.create({
      data: {
        email: `victim_${suffix()}@example.com`,
        name: "Victim",
        passwordHash: await hashPassword("Str0ngPass1"),
        role: "CUSTOMER",
      },
    });
    await admin.post(`${API}/admin/users/${victim.id}/suspend`).set("Origin", ORIGIN).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: victim.id } })).status).toBe(
      "SUSPENDED",
    );
  });

  it("returns analytics overviews", async () => {
    const admin = await adminAgent();
    const overview = await admin.get(`${API}/admin/analytics/overview`).expect(200);
    expect(overview.body.data).toHaveProperty("gmv");
    expect(overview.body.data).toHaveProperty("dailySeries");
  });
});
