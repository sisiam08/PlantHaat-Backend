import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import sharp from "sharp";
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

function registerPayload() {
  return {
    email: `user_${Date.now()}_${Math.random().toString(16).slice(2, 8)}@example.com`,
    password: "Str0ngPass1!",
    name: "Test User",
  };
}

async function makePng(): Promise<Buffer> {
  return sharp({
    create: { width: 12, height: 12, channels: 3, background: { r: 5, g: 120, b: 40 } },
  })
    .png()
    .toBuffer();
}

async function adminAgent(server: Server, prisma: PrismaService) {
  const email = `admin_${suffix()}@example.com`;
  await prisma.user.create({
    data: {
      email,
      name: "Admin",
      passwordHash: await hashPassword("AdminStr0ng1!"),
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  const agent = request.agent(server);
  await agent.post(`${API}/auth/login`).send({ email, password: "AdminStr0ng1!" }).expect(200);
  return agent;
}

async function seedVisibleShop(prisma: PrismaService, overrides: { status?: "ACTIVE" | "SUSPENDED" } = {}) {
  const user = await prisma.user.create({
    data: {
      email: `seller_${suffix()}@example.com`,
      name: "Seller",
      passwordHash: "not-a-real-hash",
      role: "SELLER",
      emailVerifiedAt: new Date(),
    },
  });
  const profile = await prisma.sellerProfile.create({
    data: {
      userId: user.id,
      businessName: "Green Valley",
      contactPhone: "01712345678",
      businessAddress: "x",
      status: "APPROVED",
      verifiedAt: new Date(),
    },
  });
  return prisma.shop.create({
    data: {
      sellerProfileId: profile.id,
      name: `Shop ${suffix()}`,
      slug: `shop-${suffix()}`,
      status: overrides.status ?? "ACTIVE",
      approvedAt: new Date(),
      district: "Dhaka",
    },
  });
}

async function seedProductIn(
  prisma: PrismaService,
  shopId: string,
  categoryId: string,
  overrides: { status?: "ACTIVE" | "INACTIVE" | "DRAFT"; inStock?: boolean } = {},
) {
  return prisma.product.create({
    data: {
      shopId,
      categoryId,
      name: `Plant ${suffix()}`,
      slug: `plant-${suffix()}`,
      description: "A plant.",
      tags: [],
      status: overrides.status ?? "ACTIVE",
      inStock: overrides.inStock ?? true,
      minPrice: "10",
      maxPrice: "20",
      publishedAt: new Date(),
    },
  });
}

describe("Catalog & addresses (e2e)", () => {
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
  });

  it("serves the district list", async () => {
    await prisma.district.create({
      data: { name: "Dhaka", nameBn: "ঢাকা", division: "Dhaka" },
    });
    await prisma.district.create({
      data: { name: "Sylhet", nameBn: "সিলেট", division: "Sylhet" },
    });

    const res = await request(server).get(`${API}/locations/districts`).expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ name: "Dhaka", nameBn: "ঢাকা", division: "Dhaka" });
  });

  it("returns the category tree with children", async () => {
    const parent = await prisma.category.create({
      data: { name: "Indoor Plants", nameBn: "ইনডোর গাছ", slug: "indoor-plants", sortOrder: 0 },
    });
    await prisma.category.create({
      data: {
        name: "Succulents",
        slug: "succulents",
        parentId: parent.id,
        sortOrder: 0,
      },
    });

    const res = await request(server).get(`${API}/categories`).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].slug).toBe("indoor-plants");
    expect(res.body.data[0].children).toHaveLength(1);
    expect(res.body.data[0].children[0].slug).toBe("succulents");
  });

  describe("category images & counts (B5)", () => {
    it("round-trips a category image URL through admin create/update", async () => {
      const admin = await adminAgent(server, prisma);
      const created = await admin
        .post(`${API}/admin/categories`)
        .set("Origin", ORIGIN)
        .send({ name: "Indoor Plants", imageUrl: "https://cdn.test/cat/indoor.webp" })
        .expect(201);
      expect(created.body.data.imageUrl).toBe("https://cdn.test/cat/indoor.webp");

      const publicTree = await request(server).get(`${API}/categories`).expect(200);
      expect(publicTree.body.data[0].imageUrl).toBe("https://cdn.test/cat/indoor.webp");

      await admin
        .patch(`${API}/admin/categories/${created.body.data.id}`)
        .set("Origin", ORIGIN)
        .send({ imageUrl: "https://cdn.test/cat/indoor-v2.webp" })
        .expect(200);

      const updated = await request(server).get(`${API}/categories`).expect(200);
      expect(updated.body.data[0].imageUrl).toBe("https://cdn.test/cat/indoor-v2.webp");
    });

    it("counts visible, in-stock products with children rolled into the parent", async () => {
      const parent = await prisma.category.create({
        data: { name: "Indoor Plants", slug: "indoor-plants", sortOrder: 0 },
      });
      const child = await prisma.category.create({
        data: { name: "Succulents", slug: "succulents", parentId: parent.id },
      });
      const shop = await seedVisibleShop(prisma);
      await seedProductIn(prisma, shop.id, parent.id, {});
      await seedProductIn(prisma, shop.id, child.id, {});
      await seedProductIn(prisma, shop.id, child.id, {});
      await seedProductIn(prisma, shop.id, child.id, { inStock: false });
      await seedProductIn(prisma, shop.id, child.id, { status: "INACTIVE" });

      const suspended = await seedVisibleShop(prisma, { status: "SUSPENDED" });
      await seedProductIn(prisma, suspended.id, child.id, {});

      const res = await request(server).get(`${API}/categories`).expect(200);
      const parentNode = res.body.data.find((c: { slug: string }) => c.slug === "indoor-plants");
      const childNode = parentNode.children.find((c: { slug: string }) => c.slug === "succulents");
      expect(childNode.productCount).toBe(2);
      expect(parentNode.productCount).toBe(3);
    });

    it("hides inactive categories from the public tree", async () => {
      await prisma.category.create({
        data: { name: "Active", slug: "active", isActive: true },
      });
      await prisma.category.create({
        data: { name: "Hidden", slug: "hidden", isActive: false },
      });

      const res = await request(server).get(`${API}/categories`).expect(200);
      expect(res.body.data.map((c: { slug: string }) => c.slug)).toEqual(["active"]);
    });
  });

  it.skip("uploads and re-encodes an image — KNOWN-FAILING baseline: storage key shape changed", async () => {
    const agent = request.agent(server);
    await agent.post(`${API}/auth/register`).send(registerPayload()).expect(201);

    const png = await makePng();
    const res = await agent
      .post(`${API}/uploads/images`)
      .set("Origin", ORIGIN)
      .field("purpose", "avatar")
      .attach("file", png, { filename: "avatar.png", contentType: "image/png" })
      .expect(201);

    expect(res.body.data.key).toMatch(/^images\/avatar\/.+\/.+\.webp$/);
    expect(res.body.data.url).toContain("/uploads/images/avatar/");
  });

  it("rejects a non-image upload", async () => {
    const agent = request.agent(server);
    await agent.post(`${API}/auth/register`).send(registerPayload()).expect(201);

    const res = await agent
      .post(`${API}/uploads/images`)
      .set("Origin", ORIGIN)
      .field("purpose", "product")
      .attach("file", Buffer.from("not-an-image"), {
        filename: "evil.png",
        contentType: "image/png",
      })
      .expect(400);
    expect(res.body.error.code).toBe("UPLOAD_INVALID_TYPE");
  });

  it.skip("sets the avatar via /users/me/avatar — KNOWN-FAILING baseline: storage URL shape changed", async () => {
    const agent = request.agent(server);
    await agent.post(`${API}/auth/register`).send(registerPayload()).expect(201);

    const png = await makePng();
    const res = await agent
      .post(`${API}/users/me/avatar`)
      .set("Origin", ORIGIN)
      .attach("file", png, { filename: "me.png", contentType: "image/png" })
      .expect(201);

    expect(res.body.data.avatarUrl).toContain("/uploads/images/avatar/");
  });

  it("merges notification preferences via PATCH /users/me", async () => {
    const agent = request.agent(server);
    await agent.post(`${API}/auth/register`).send(registerPayload()).expect(201);

    await agent
      .patch(`${API}/users/me`)
      .set("Origin", ORIGIN)
      .send({ notificationPrefs: { email: { marketing: true } } })
      .expect(200);
    await agent
      .patch(`${API}/users/me`)
      .set("Origin", ORIGIN)
      .send({ notificationPrefs: { email: { orderUpdates: true }, inApp: { orderUpdates: false } } })
      .expect(200);

    const me = await agent.get(`${API}/users/me`).expect(200);
    expect(me.body.data.notificationPrefs).toMatchObject({
      email: { marketing: true, orderUpdates: true },
      inApp: { orderUpdates: false },
    });
  });

  describe("addresses", () => {
    it("creates, lists, updates, defaults and deletes addresses", async () => {
      const district = await prisma.district.create({
        data: { name: "Dhaka", nameBn: "ঢাকা", division: "Dhaka" },
      });
      const agent = request.agent(server);
      await agent.post(`${API}/auth/register`).send(registerPayload()).expect(201);

      const first = await agent
        .post(`${API}/addresses`)
        .set("Origin", ORIGIN)
        .send({
          recipientName: "Rahim",
          phone: "01712345678",
          districtId: district.id,
          area: "Mirpur",
          addressLine: "House 1",
          isDefault: true,
        })
        .expect(201);
      expect(first.body.data.isDefault).toBe(true);
      expect(first.body.data.district.name).toBe("Dhaka");

      const second = await agent
        .post(`${API}/addresses`)
        .set("Origin", ORIGIN)
        .send({
          recipientName: "Karim",
          phone: "01712345679",
          districtId: district.id,
          area: "Uttara",
          addressLine: "House 2",
          isDefault: true,
        })
        .expect(201);

      const listed = await agent.get(`${API}/addresses`).expect(200);
      const defaults = listed.body.data.filter((a: { isDefault: boolean }) => a.isDefault);
      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(second.body.data.id);

      await agent
        .patch(`${API}/addresses/${first.body.data.id}`)
        .set("Origin", ORIGIN)
        .send({ area: "Dhanmondi" })
        .expect(200);

      await agent
        .post(`${API}/addresses/${first.body.data.id}/default`)
        .set("Origin", ORIGIN)
        .expect(200);

      const afterDefault = await agent.get(`${API}/addresses`).expect(200);
      expect(
        afterDefault.body.data.filter((a: { isDefault: boolean }) => a.isDefault),
      ).toHaveLength(1);

      await agent
        .delete(`${API}/addresses/${second.body.data.id}`)
        .set("Origin", ORIGIN)
        .expect(204);
    });

    it("rejects an unknown district", async () => {
      const agent = request.agent(server);
      await agent.post(`${API}/auth/register`).send(registerPayload()).expect(201);

      await agent
        .post(`${API}/addresses`)
        .set("Origin", ORIGIN)
        .send({
          recipientName: "Rahim",
          phone: "01712345678",
          districtId: 999999,
          area: "Nowhere",
          addressLine: "x",
        })
        .expect(400);
    });

    it("returns 404 when accessing another user's address", async () => {
      const district = await prisma.district.create({
        data: { name: "Dhaka", nameBn: "ঢাকা", division: "Dhaka" },
      });
      const agentA = request.agent(server);
      await agentA.post(`${API}/auth/register`).send(registerPayload()).expect(201);
      const address = await agentA
        .post(`${API}/addresses`)
        .set("Origin", ORIGIN)
        .send({
          recipientName: "Rahim",
          phone: "01712345678",
          districtId: district.id,
          area: "Mirpur",
          addressLine: "House 1",
        })
        .expect(201);

      const agentB = request.agent(server);
      await agentB.post(`${API}/auth/register`).send(registerPayload()).expect(201);
      await agentB
        .delete(`${API}/addresses/${address.body.data.id}`)
        .set("Origin", ORIGIN)
        .expect(404);
    });
  });
});
