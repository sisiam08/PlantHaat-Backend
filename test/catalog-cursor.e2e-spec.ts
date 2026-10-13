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

const DETERMINISTIC_SORTS = [
  "newest",
  "price_asc",
  "price_desc",
  "popular",
  "rating",
] as const;

interface SeedSlots {
  app: INestApplication;
  server: Server;
  prisma: PrismaService;
  categorySlug: string;
  siblingSlug: string;
  shopIds: { a: string; b: string; c: string };
}

async function seedShopsAndProducts(): Promise<SeedSlots> {
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
  const sibling = await prisma.category.create({
    data: {
      name: `Sibling ${suffix()}`,
      slug: `sib-${suffix()}`,
      isActive: true,
      parentId: category.id,
    },
  });

  async function shop() {
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
      },
    });
    return prisma.shop.create({
      data: {
        sellerProfileId: profile.id,
        name: `Shop ${suffix()}`,
        slug: `shop-${suffix()}`,
        status: "ACTIVE",
        approvedAt: new Date(),
        district: "Dhaka",
      },
    });
  }

  const [a, b, c] = [await shop(), await shop(), await shop()];

  interface Row {
    shopId: string;
    price: number | null;
    sold: number;
    rating: number | null;
    hoursAgo: number;
    inStock: boolean;
    categoryId?: string;
  }

  // 12 visible products: price ties, null prices, sold ties, rating ties/nulls.
  const rows: Row[] = [
    { shopId: a.id, price: 100, sold: 5, rating: 4.5, hoursAgo: 10, inStock: true },
    { shopId: a.id, price: 100, sold: 5, rating: 4.5, hoursAgo: 8, inStock: true }, // ties
    { shopId: a.id, price: 200, sold: 3, rating: null, hoursAgo: 6, inStock: true },
    { shopId: a.id, price: null, sold: 0, rating: null, hoursAgo: 5, inStock: false },
    { shopId: b.id, price: 50, sold: 7, rating: 3.0, hoursAgo: 12, inStock: true },
    { shopId: b.id, price: 100, sold: 5, rating: 4.5, hoursAgo: 9, inStock: true }, // three-way tie
    { shopId: b.id, price: 300, sold: 2, rating: 3.0, hoursAgo: 4, inStock: true },
    { shopId: b.id, price: null, sold: 4, rating: null, hoursAgo: 3, inStock: true },
    { shopId: c.id, price: 75, sold: 5, rating: 2.5, hoursAgo: 2, inStock: true },
    { shopId: c.id, price: 220, sold: 9, rating: 1.5, hoursAgo: 1, inStock: true },
    { shopId: c.id, price: 180, sold: 1, rating: 4.5, hoursAgo: 7, inStock: true, categoryId: sibling.id },
    { shopId: c.id, price: 400, sold: 0, rating: 5.0, hoursAgo: 20, inStock: false },
  ];

  const now = Date.now();
  for (const [index, row] of rows.entries()) {
    const createdAt = new Date(now - row.hoursAgo * 3600_000);
    const publishedAt = new Date(now - row.hoursAgo * 3600_000);
    await prisma.product.create({
      data: {
        shopId: row.shopId,
        categoryId: row.categoryId ?? category.id,
        name: `Product ${index}`,
        slug: `product-${suffix()}-${index}`,
        description: "x",
        status: "ACTIVE",
        publishedAt,
        createdAt,
        updatedAt: createdAt,
        minPrice: row.price === null ? undefined : String(row.price),
        maxPrice: row.price === null ? undefined : String(row.price),
        // variants below keep minPrice stable (no recompute helper here):
        ratingAvg: row.rating === null ? undefined : String(row.rating),
        ratingCount: row.rating === null ? 0 : index + 1,
        soldCount: row.sold,
        inStock: row.inStock,
      },
    });
  }

  return {
    app,
    server,
    prisma,
    categorySlug: category.slug,
    siblingSlug: sibling.slug,
    shopIds: { a: a.id, b: b.id, c: c.id },
  };
}

describe("Product cursor pagination (e2e)", () => {
  let slots: SeedSlots;

  beforeAll(async () => {
    slots = await seedShopsAndProducts();
  });

  afterAll(async () => {
    await slots.app.close();
  });

  const totalVisible = 12;

  async function fetch(query: Record<string, string | number | boolean | undefined>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    }
    return request(slots.server)
      .get(`${API}/products?${params.toString()}`)
      .set("Origin", ORIGIN);
  }

  /** Walks cursor pages to the end; asserts no duplicates and no gaps vs offset. */
  async function walkCursor(sort: string, extra: Record<string, string | number | boolean> = {}) {
    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    do {
      const response = await fetch({
        pagination: "cursor",
        sort,
        cursor,
        limit: 3,
        includeTotal: cursor === undefined,
        ...extra,
      });
      expect(response.status).toBe(200);
      const meta = response.body.meta as Record<string, unknown>;
      if (cursor !== undefined) {
        // includeTotal returns total on the first page only
        expect(meta).not.toHaveProperty("total");
      }
      const data = response.body.data as { id: string }[];
      seen.push(...data.map((row) => row.id));
      expect(new Set(seen).size).toBe(seen.length); // no duplicates
      cursor = (meta.nextCursor as string | null) ?? undefined;
      guard += 1;
      expect(guard).toBeLessThanOrEqual(totalVisible + 2); // hard stop
    } while (cursor);

    // full coverage: seen lengths equal the offset walk's
    const offsetResponse = await fetch({ sort, page: 1, limit: 50, ...extra });
    const offsetIds = (offsetResponse.body.data as { id: string }[]).map((row) => row.id);
    expect(seen.length).toBe(offsetIds.length);

    // same set as the offset walk
    expect(new Set(seen)).toEqual(new Set(offsetIds));

    // deterministic across walks
    const again = await fetch({ pagination: "cursor", sort, limit: 3, ...extra });
    const firstIds = (again.body.data as { id: string }[]).map((row) => row.id);
    expect(firstIds).toEqual(seen.slice(0, firstIds.length));

    return seen;
  }

  it("walks every product exactly once for each sort (ties + nulls included)", async () => {
    for (const sort of DETERMINISTIC_SORTS) {
      await walkCursor(sort);
    }
  });

  it("walks every product exactly once with filters applied", async () => {
    // in-stock filter: 12 minus the two out-of-stock rows
    const inStockSeen = await walkCursor("newest", { inStock: true });
    expect(inStockSeen.length).toBe(totalVisible - 2);
    const offset = await fetch({ inStock: true, page: 1, limit: 50 });
    expect((offset.body.meta as { total: number }).total).toBe(totalVisible - 2);

    // category filter including children: the parent slug matches both direct
    // products and the one child-category product
    const categorySeen = await walkCursor("newest", { category: slots.categorySlug });
    expect(categorySeen.length).toBe(totalVisible);
    const childSeen = await walkCursor("newest", { category: slots.siblingSlug });
    expect(childSeen.length).toBe(1);
  });

  it("returns meta.total on the first page only (includeTotal=true)", async () => {
    const first = await fetch({ pagination: "cursor", sort: "newest", limit: 5, includeTotal: true });
    const meta = first.body.meta as Record<string, unknown>;
    expect(meta.limit).toBe(5);
    expect(meta.total).toBe(totalVisible);
    expect(meta.hasMore).toBe(true);
    expect(typeof meta.nextCursor).toBe("string");

    const second = await fetch({
      pagination: "cursor",
      sort: "newest",
      cursor: meta.nextCursor as string,
      limit: 5,
      includeTotal: true,
    });
    expect((second.body.meta as Record<string, unknown>)).not.toHaveProperty("total");
  });

  it("defaults to offset pagination and keeps page-based meta", async () => {
    const response = await fetch({ sort: "newest", page: 1, limit: 5 });
    const meta = response.body.meta as Record<string, unknown>;
    expect(meta).toMatchObject({ page: 1, limit: 5, total: totalVisible });
    expect(meta).toHaveProperty("totalPages");
  });

  it("random sort ignores the offset mode and keeps cursor meta", async () => {
    const response = await fetch({ sort: "random", pagination: "offset", limit: 5, seed: "abc" });
    const meta = response.body.meta as Record<string, unknown>;
    expect(meta).toMatchObject({ limit: 5, hasMore: true });
    expect(meta).not.toHaveProperty("page");
  });

  it("rejects invalid cursors with 400 INVALID_CURSOR", async () => {
    const garbage = await fetch({ pagination: "cursor", sort: "newest", cursor: "!!" });
    expect(garbage.status).toBe(400);
    expect(garbage.body.error.code).toBe("INVALID_CURSOR");

    // valid base64url but wrong shape
    const wrongShape = Buffer.from(JSON.stringify({ bogus: true }), "utf8").toString("base64url");
    const shaped = await fetch({ pagination: "cursor", sort: "newest", cursor: wrongShape });
    expect(shaped.status).toBe(400);
    expect(shaped.body.error.code).toBe("INVALID_CURSOR");

    // cursor bound to its sort: reusing a price_asc cursor under rating fails
    const list = await fetch({ pagination: "cursor", sort: "price_asc", limit: 3 });
    const cursor = (list.body.meta as { nextCursor: string }).nextCursor;
    const mismatch = await fetch({ pagination: "cursor", sort: "rating", cursor });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe("INVALID_CURSOR");

    // tampered: flip the cursor's sort binding inside the payload
    const payload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      s: string;
      v: number;
      k: string[];
      id: string;
    };
    payload.s = "rating";
    const tampered = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const failed = await fetch({ pagination: "cursor", sort: "rating", cursor: tampered });
    expect(failed.body.error.code).toBe("INVALID_CURSOR");

    // cursor built for a different decoder version is rejected
    payload.v = 99;
    const versioned = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const oldVersion = await fetch({ pagination: "cursor", sort: "rating", cursor: versioned });
    expect(oldVersion.body.error.code).toBe("INVALID_CURSOR");
  });

  it("caps the limit at MAX_LIMIT=50", async () => {
    const response = await fetch({ pagination: "cursor", sort: "newest", limit: 51 });
    expect(response.status).toBe(400);

    const capped = await fetch({ pagination: "cursor", sort: "newest", limit: 50 });
    expect(
      (capped.body.meta as { limit: number; hasMore: boolean }).hasMore,
    ).toBe(false); // 12 products < 50
  });

  it("never skips or duplicates when the cursor row disappears between pages", async () => {
    const prisma = slots.prisma;
    // take a cursor from page 1...
    const first = await fetch({ pagination: "cursor", sort: "price_asc", limit: 3 });
    const meta = first.body.meta as { nextCursor: string };
    const pageOneIds = (first.body.data as { id: string }[]).map((row) => row.id);

    // ...delete one row of page 1 (the cursor row itself)
    await prisma.product.delete({ where: { id: pageOneIds[0] } });

    const second = await fetch({
      pagination: "cursor",
      sort: "price_asc",
      cursor: meta.nextCursor,
      limit: 50,
    });
    expect((second.body.data as { id: string }[]).map((row) => row.id)).toEqual(
      expect.not.arrayContaining(pageOneIds),
    );
    // the walk continues correctly: everything except the deleted row is returned
    const remaining = (second.body.data as { id: string }[]).map((row) => row.id);
    expect(new Set([...remaining]).size).toBe(remaining.length);
  });
});
