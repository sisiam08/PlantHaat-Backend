import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { AppConfigService } from "../src/config/app-config.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./cleanup";

const API = "/api/v1";
const ORIGIN = "http://localhost:3000";

function suffix(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

interface Slots {
  app: INestApplication;
  server: Server;
  prisma: PrismaService;
  categorySlug: string;
  ids: Record<string, string>;
}

async function seed(): Promise<Slots> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, app.get(AppConfigService), {
    swagger: false,
    helmet: false,
    staticFiles: false,
  });
  await app.init();
  const server = app.getHttpServer() as Server;
  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);

  const category = await prisma.category.create({
    data: { name: `Cat ${suffix()}`, slug: `cat-${suffix()}`, isActive: true },
  });
  const user = await prisma.user.create({
    data: {
      email: `seller_${suffix()}@example.com`,
      name: "Seller",
      passwordHash: "x",
      role: "SELLER",
      emailVerifiedAt: new Date(),
    },
  });
  const profile = await prisma.sellerProfile.create({
    data: {
      userId: user.id,
      businessName: "Shop",
      contactPhone: "01712345678",
      businessAddress: "x",
      status: "APPROVED",
    },
  });
  const shop = await prisma.shop.create({
    data: {
      sellerProfileId: profile.id,
      name: `Shop ${suffix()}`,
      slug: `shop-${suffix()}`,
      status: "ACTIVE",
      approvedAt: new Date(),
    },
  });

  const rows: {
    key: string;
    light: "FULL_SUN" | "LOW_LIGHT" | "PARTIAL_SHADE" | "BRIGHT_INDIRECT";
    difficulty: "EASY" | "HARD" | "MODERATE";
    petSafe: boolean;
    inStock: boolean;
    rating: number;
    ratingCount: number;
    sale: boolean;
    price: number;
  }[] = [
    { key: "a", light: "FULL_SUN", difficulty: "EASY", petSafe: true, inStock: true, rating: 4.5, ratingCount: 3, sale: true, price: 100 },
    { key: "b", light: "LOW_LIGHT", difficulty: "HARD", petSafe: false, inStock: true, rating: 3.0, ratingCount: 2, sale: false, price: 200 },
    { key: "c", light: "PARTIAL_SHADE", difficulty: "EASY", petSafe: true, inStock: false, rating: 5.0, ratingCount: 1, sale: true, price: 300 },
    { key: "d", light: "BRIGHT_INDIRECT", difficulty: "MODERATE", petSafe: false, inStock: true, rating: 0, ratingCount: 0, sale: false, price: 400 },
    { key: "e", light: "FULL_SUN", difficulty: "HARD", petSafe: true, inStock: true, rating: 4.0, ratingCount: 5, sale: false, price: 500 },
  ];

  const ids: Record<string, string> = {};
  for (const row of rows) {
    const product = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        name: `Filter ${row.key}`,
        slug: `filter-${suffix()}-${row.key}`,
        description: "x",
        status: "ACTIVE",
        publishedAt: new Date(),
        minPrice: String(row.price),
        maxPrice: String(row.price),
        inStock: row.inStock,
        lightRequirement: row.light,
        careDifficulty: row.difficulty,
        isPetSafe: row.petSafe,
        isIndoor: true,
        ratingAvg: String(row.rating),
        ratingCount: row.ratingCount,
        hasDiscount: row.sale,
      },
    });
    ids[row.key] = product.id;
  }

  return { app, server, prisma, categorySlug: category.slug, ids };
}

describe("Catalog filters (e2e)", () => {
  let slots: Slots;

  beforeAll(async () => {
    slots = await seed();
  });
  afterAll(async () => {
    await slots.app.close();
  });

  function list(query: Record<string, string | number | boolean | undefined>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.append(key, String(value));
    }
    return request(slots.server).get(`${API}/products?${params.toString()}`).set("Origin", ORIGIN);
  }

  function idsOf(body: { data: { id: string }[] }): string[] {
    return body.data.map((row) => row.id).sort();
  }

  it("accepts a single, repeated or comma-separated light filter", async () => {
    const single = await list({ light: "FULL_SUN", limit: 50 }).expect(200);
    expect(idsOf(single.body)).toEqual([slots.ids.a, slots.ids.e].sort());

    const repeated = await list({ light: "FULL_SUN", limit: 50 });
    expect(idsOf(repeated.body)).toEqual([slots.ids.a, slots.ids.e].sort());

    const csv = await request(slots.server)
      .get(`${API}/products?limit=50&light=FULL_SUN,LOW_LIGHT`)
      .set("Origin", ORIGIN)
      .expect(200);
    expect(idsOf(csv.body)).toEqual([slots.ids.a, slots.ids.e, slots.ids.b].sort());
  });

  it("accepts repeated or comma-separated difficulty", async () => {
    const csv = await request(slots.server)
      .get(`${API}/products?limit=50&difficulty=EASY,HARD`)
      .set("Origin", ORIGIN)
      .expect(200);
    expect(idsOf(csv.body)).toEqual(
      [slots.ids.a, slots.ids.c, slots.ids.b, slots.ids.e].sort(),
    );
  });

  it("filters by minRating (ratingAvg >= value and ratingCount > 0)", async () => {
    const minRating = await list({ minRating: 4, limit: 50 }).expect(200);
    expect(idsOf(minRating.body)).toEqual([slots.ids.a, slots.ids.c, slots.ids.e].sort());
  });

  it("filters by onSale (denormalized hasDiscount)", async () => {
    const onSale = await list({ onSale: true, limit: 50 }).expect(200);
    expect(idsOf(onSale.body)).toEqual([slots.ids.a, slots.ids.c].sort());
  });

  it("combines filters and works with cursor pagination and random sort", async () => {
    const combined = await list({ light: "FULL_SUN", onSale: true, limit: 50 }).expect(200);
    expect(idsOf(combined.body)).toEqual([slots.ids.a]);

    const cursor = await list({ minRating: 4, pagination: "cursor", sort: "rating", limit: 2, includeTotal: true }).expect(200);
    expect(cursor.body.meta.total).toBe(3);
    expect(cursor.body.data).toHaveLength(2);

    const random = await list({ onSale: true, sort: "random", seed: "abc", limit: 50 }).expect(200);
    expect(idsOf(random.body)).toEqual([slots.ids.a, slots.ids.c].sort());
  });

  it("returns filter-options facets for the current category context", async () => {
    const res = await request(slots.server)
      .get(`${API}/products/filter-options?category=${slots.categorySlug}`)
      .set("Origin", ORIGIN)
      .expect(200);
    expect(res.body.data.price).toEqual({ min: 100, max: 500 });
    expect([...res.body.data.light].sort()).toEqual(
      ["BRIGHT_INDIRECT", "FULL_SUN", "LOW_LIGHT", "PARTIAL_SHADE"].sort(),
    );
    expect([...res.body.data.difficulty].sort()).toEqual(["EASY", "HARD", "MODERATE"].sort());
  });
});
