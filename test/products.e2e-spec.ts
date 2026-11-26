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

function sellerPayload() {
  return {
    email: `seller_${Date.now()}_${Math.random().toString(16).slice(2, 8)}@example.com`,
    password: "Str0ngPass1!",
    name: "Seller",
    businessName: "Green Valley Nursery",
    contactPhone: "01712345678",
  };
}

describe("Products (e2e)", () => {
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

  async function approvedSeller() {
    const agent = request.agent(server);
    const reg = await agent.post(`${API}/auth/register/seller`).send(sellerPayload()).expect(201);
    const userId = reg.body.data.user.id as string;
    const profile = await prisma.sellerProfile.findUniqueOrThrow({ where: { userId } });
    await prisma.sellerProfile.update({
      where: { id: profile.id },
      data: { status: "APPROVED", businessAddress: "Mirpur" },
    });
    const shop = await prisma.shop.create({
      data: {
        sellerProfileId: profile.id,
        name: "Green Valley Nursery",
        slug: `green-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        status: "ACTIVE",
        approvedAt: new Date(),
      },
    });
    return { agent, userId, shop, profileId: profile.id };
  }

  async function createActiveProduct(agent: ReturnType<typeof request.agent>) {
    const category = await prisma.category.create({
      data: { name: "Indoor Plants", slug: `indoor-${Date.now()}`, isActive: true },
    });
    const created = await agent
      .post(`${API}/seller/products`)
      .set("Origin", ORIGIN)
      .send({
        categoryId: category.id,
        name: "Monstera Deliciosa",
        description: "A popular tropical houseplant.",
        tags: ["monstera"],
      })
      .expect(201);
    const productId = created.body.data.id as string;

    const withVariant = await agent
      .post(`${API}/seller/products/${productId}/variants`)
      .set("Origin", ORIGIN)
      .send({ name: "Standard", price: 850, stockQty: 10 })
      .expect(201);
    const variantId = withVariant.body.data.variants[0].id as string;

    await agent
      .post(`${API}/seller/products/${productId}/images`)
      .set("Origin", ORIGIN)
      .send({ url: "https://cdn.test/monstera.webp", isPrimary: true })
      .expect(201);

    const activated = await agent
      .post(`${API}/seller/products/${productId}/status`)
      .set("Origin", ORIGIN)
      .send({ status: "ACTIVE" })
      .expect(200);

    return { productId, variantId, slug: activated.body.data.slug as string, category };
  }

  it("creates, activates and publishes a product", async () => {
    const { agent } = await approvedSeller();
    const { slug } = await createActiveProduct(agent);

    const detail = await request(server).get(`${API}/products/${slug}`).expect(200);
    expect(detail.body.data.variants).toHaveLength(1);
    expect(detail.body.data.images).toHaveLength(1);
    expect(detail.body.data.shop.name).toBe("Green Valley Nursery");

    const listed = await request(server).get(`${API}/products`).expect(200);
    expect(listed.body.data.some((p: { slug: string }) => p.slug === slug)).toBe(true);
  });

  it("filters by search term, category and stock", async () => {
    const { agent } = await approvedSeller();
    const { slug, category } = await createActiveProduct(agent);

    const bySearch = await request(server).get(`${API}/products?q=monstera`).expect(200);
    expect(bySearch.body.data.some((p: { slug: string }) => p.slug === slug)).toBe(true);

    const byCategory = await request(server)
      .get(`${API}/products?category=${category.slug}`)
      .expect(200);
    expect(byCategory.body.data.some((p: { slug: string }) => p.slug === slug)).toBe(true);

    const byStock = await request(server).get(`${API}/products?inStock=true`).expect(200);
    expect(byStock.body.data.some((p: { slug: string }) => p.slug === slug)).toBe(true);
  });

  it("returns every active product for any valid district (nationwide delivery)", async () => {
    const district = await prisma.district.create({
      data: { name: "Dhaka", nameBn: "ঢাকা", division: "Dhaka" },
    });
    const otherDistrict = await prisma.district.create({
      data: { name: "Sylhet", nameBn: "সিলেট", division: "Sylhet" },
    });
    const { agent } = await approvedSeller();
    await agent
      .post(`${API}/seller/delivery-zones`)
      .set("Origin", ORIGIN)
      .send({ name: "Dhaka", districtIds: [district.id], charge: 60 })
      .expect(201);
    const { slug } = await createActiveProduct(agent);

    const covered = await request(server)
      .get(`${API}/products?deliversTo=${district.id}`)
      .expect(200);
    expect(covered.body.data.some((p: { slug: string }) => p.slug === slug)).toBe(true);

    const uncovered = await request(server)
      .get(`${API}/products?deliversTo=${otherDistrict.id}`)
      .expect(200);
    expect(uncovered.body.data.some((p: { slug: string }) => p.slug === slug)).toBe(true);
  });

  it("guards stock against going negative", async () => {
    const { agent } = await approvedSeller();
    const { variantId } = await createActiveProduct(agent);

    const res = await agent
      .post(`${API}/seller/variants/${variantId}/stock`)
      .set("Origin", ORIGIN)
      .send({ delta: -100 })
      .expect(422);
    expect(res.body.error.code).toBe("INSUFFICIENT_STOCK");
  });

  it("hides a product from the catalog after admin removal", async () => {
    const { agent } = await approvedSeller();
    const { productId, slug } = await createActiveProduct(agent);

    const adminEmail = `admin_${Date.now()}@example.com`;
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

    await admin
      .post(`${API}/admin/products/${productId}/remove`)
      .set("Origin", ORIGIN)
      .send({ reason: "Policy violation" })
      .expect(200);

    const listed = await request(server).get(`${API}/products`).expect(200);
    expect(listed.body.data.some((p: { slug: string }) => p.slug === slug)).toBe(false);
  });

  it("counts a view sent as the product UUID", async () => {
    const seller = await approvedSeller();
    const { productId } = await createActiveProduct(seller.agent);

    await request(server).post(`${API}/products/${productId}/view`).expect(204);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.viewCount).toBe(1);
  });

  it("counts a view sent as the product slug", async () => {
    const seller = await approvedSeller();
    const { productId, slug } = await createActiveProduct(seller.agent);

    await request(server).post(`${API}/products/${slug}/view`).expect(204);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.viewCount).toBe(1);
  });

  it("ignores an unknown id/slug without failing", async () => {
    const seller = await approvedSeller();
    const { productId, slug } = await createActiveProduct(seller.agent);
    const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } });

    await request(server).post(`${API}/products/no-such-slug-f3a1/view`).expect(204);
    await request(server)
      .post(`${API}/products/00000000-0000-4000-8000-000000000000/view`)
      .expect(204);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const after = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(after.viewCount).toBe(before.viewCount);
    expect(slug).toBeTruthy();
  });

  it("counts at most one product view per IP within the window", async () => {
    const seller = await approvedSeller();
    const { productId } = await createActiveProduct(seller.agent);

    await request(server).post(`${API}/products/${productId}/view`).expect(204);
    await request(server).post(`${API}/products/${productId}/view`).expect(204);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.viewCount).toBe(1);
  });

  it("does not increment viewCount on GET /products/:slug", async () => {
    const seller = await approvedSeller();
    const { productId, slug } = await createActiveProduct(seller.agent);

    await request(server).get(`${API}/products/${slug}`).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 400));

    const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.viewCount).toBe(0);
  });

  it("does not expose another seller's product", async () => {
    const first = await approvedSeller();
    const { productId } = await createActiveProduct(first.agent);

    const second = await approvedSeller();
    const res = await second.agent.get(`${API}/seller/products/${productId}`).expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
