import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { AppConfigService } from "../src/config/app-config.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { PublicProductsService } from "../src/modules/products/public-products.service";
import { resetDatabase } from "./cleanup";

const API = "/api/v1";

describe("Catalog random feed (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let catalog: PublicProductsService;

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
    catalog = app.get(PublicProductsService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    catalog.invalidateRandomCache();
  });

  let seq = 0;
  function unique(prefix: string): string {
    seq += 1;
    return `${prefix}-${Date.now()}-${seq}`;
  }

  async function seedShop(overrides: { district?: string; status?: string } = {}) {
    const user = await prisma.user.create({
      data: {
        email: `${unique("seller")}@example.com`,
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
        businessAddress: "Secret Street 12",
        status: "APPROVED",
        verifiedAt: new Date(),
      },
    });
    const shop = await prisma.shop.create({
      data: {
        sellerProfileId: profile.id,
        name: `Green Valley ${unique("shop")}`,
        slug: unique("green-valley"),
        status: (overrides.status ?? "ACTIVE") as "ACTIVE",
        approvedAt: new Date(),
        district: overrides.district ?? "Dhaka",
        address: "House 42, Secret Street",
        phone: "01799999999",
        logoUrl: "https://cdn.test/logo.webp",
        ratingAvg: "4.50",
        ratingCount: 5,
      },
    });
    return { user, profile, shop };
  }

  async function seedCategory(name: string, parentId?: string) {
    return prisma.category.create({
      data: {
        name,
        slug: unique(name.toLowerCase().replace(/\s+/g, "-")),
        parentId: parentId ?? null,
      },
    });
  }

  async function seedProduct(
    shopId: string,
    categoryId: string,
    overrides: Partial<{
      status: "ACTIVE" | "INACTIVE" | "DRAFT" | "PENDING_REVIEW";
      inStock: boolean;
      deletedAt: Date;
      name: string;
    }> = {},
  ) {
    return prisma.product.create({
      data: {
        shopId,
        categoryId,
        name: overrides.name ?? `Plant ${unique("p")}`,
        slug: unique("plant"),
        description: "A nice plant.",
        tags: [],
        status: overrides.status ?? "ACTIVE",
        inStock: overrides.inStock ?? true,
        minPrice: "120",
        maxPrice: "200",
        publishedAt: new Date(),
        deletedAt: overrides.deletedAt ?? null,
      },
    });
  }

  async function walkRandom(query: string): Promise<string[]> {
    const collected: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const url = cursor
        ? `${API}/products?${query}&cursor=${encodeURIComponent(cursor)}`
        : `${API}/products?${query}`;
      const res = await request(server).get(url).expect(200);
      collected.push(...res.body.data.map((p: { id: string }) => p.id));
      if (!res.body.meta.hasMore) break;
      cursor = res.body.meta.nextCursor as string;
      expect(cursor).toBeTruthy();
    }
    return collected;
  }

  it("is deterministic for a given seed and paginates without gaps or duplicates", async () => {
    const { shop } = await seedShop();
    const category = await seedCategory("Indoor");
    const created = [];
    for (let i = 0; i < 12; i += 1) {
      created.push(await seedProduct(shop.id, category.id, { name: `Plant ${i}` }));
    }
    const allIds = created.map((p) => p.id).sort();

    const first = await request(server)
      .get(`${API}/products?sort=random&seed=abc123&limit=5`)
      .expect(200);
    const second = await request(server)
      .get(`${API}/products?sort=random&seed=abc123&limit=5`)
      .expect(200);
    expect(first.body.data.map((p: { id: string }) => p.id)).toEqual(
      second.body.data.map((p: { id: string }) => p.id),
    );
    expect(first.body.meta).toEqual({ limit: 5, nextCursor: expect.any(String), hasMore: true });
    expect(first.body.meta.total).toBeUndefined();

    const walked = await walkRandom("sort=random&seed=abc123&limit=5");
    expect(walked).toHaveLength(12);
    expect(new Set(walked).size).toBe(12);
    expect([...walked].sort()).toEqual(allIds);
  });

  it("gives a different order for a different seed", async () => {
    const { shop } = await seedShop();
    const category = await seedCategory("Indoor");
    for (let i = 0; i < 12; i += 1) {
      await seedProduct(shop.id, category.id, { name: `Plant ${i}` });
    }

    const a = await walkRandom("sort=random&seed=seed-a&limit=50");
    const b = await walkRandom("sort=random&seed=seed-b&limit=50");
    expect(a).not.toEqual(b);
  });

  it("matches the non-random result set for the same filters", async () => {
    const { shop } = await seedShop();
    const category = await seedCategory("Indoor");
    for (let i = 0; i < 9; i += 1) {
      await seedProduct(shop.id, category.id, { name: `In-stock ${i}` });
    }
    await seedProduct(shop.id, category.id, { name: "Out of stock", inStock: false });

    const standard = await request(server).get(`${API}/products?inStock=true&limit=50`).expect(200);
    const standardIds = standard.body.data.map((p: { id: string }) => p.id).sort();

    const randomIds = (await walkRandom("sort=random&seed=parity&inStock=true&limit=4")).sort();
    expect(randomIds).toEqual(standardIds);
    expect(standardIds).toHaveLength(9);
  });

  it("rejects an invalid cursor and a limit above the cap", async () => {
    const { shop } = await seedShop();
    const category = await seedCategory("Indoor");
    await seedProduct(shop.id, category.id);

    const badCursor = await request(server)
      .get(`${API}/products?sort=random&seed=abc&cursor=not-a-valid-cursor`)
      .expect(400);
    expect(badCursor.body.error.code).toBe("INVALID_CURSOR");

    await request(server).get(`${API}/products?sort=random&limit=500`).expect(400);
  });

  it("never exposes hidden or suspended products", async () => {
    const active = await seedShop();
    const category = await seedCategory("Indoor");
    const visible = await seedProduct(active.shop.id, category.id, { name: "Visible" });
    await seedProduct(active.shop.id, category.id, { name: "Inactive", status: "INACTIVE" });
    await seedProduct(active.shop.id, category.id, { name: "Deleted", deletedAt: new Date() });

    const suspended = await seedShop({ status: "SUSPENDED" });
    await seedProduct(suspended.shop.id, category.id, { name: "Suspended shop" });

    const ids = await walkRandom("sort=random&seed=hidden&limit=50");
    expect(ids).toContain(visible.id);
    expect(ids).toHaveLength(1);
  });
});
