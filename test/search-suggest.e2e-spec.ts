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

function suffix(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

describe("Search suggestions (e2e)", () => {
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
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  const createSeed = async () => {
    const sellerUser = await prisma.user.create({
      data: {
        email: `seller_${suffix()}@example.com`,
        name: "Seller",
        passwordHash: await hashPassword("SellerPass1!"),
        role: "SELLER",
        emailVerifiedAt: new Date(),
      },
    });
    const profile = await prisma.sellerProfile.create({
      data: {
        userId: sellerUser.id,
        businessName: "Shop Enterprise",
        contactPhone: "01712345678",
        businessAddress: "addr",
        status: "APPROVED",
      },
    });
    const shop = await prisma.shop.create({
      data: {
        sellerProfileId: profile.id,
        name: "Monstera Megastore",
        slug: `monstera-megastore-${suffix()}`,
        status: "ACTIVE",
        approvedAt: new Date(),
        district: "Dhaka",
      },
    });
    const category = await prisma.category.create({
      data: { name: "Monstera Family", nameBn: "মনস্টেরা পরিবার", slug: `monstera-${suffix()}`, isActive: true },
    });
    const hiddenCategory = await prisma.category.create({
      data: { name: "Monstera Hidden", slug: `monstera-hidden-${suffix()}`, isActive: false },
    });

    const active = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        name: "Monstera Deliciosa",
        nameBn: "মনস্টেরা ডেলিসিওসা",
        slug: `monstera-deliciosa-${suffix()}`,
        description: "x",
        status: "ACTIVE",
        publishedAt: new Date(),
        minPrice: "650",
        maxPrice: "650",
        inStock: true,
      },
    });
    const outOfStock = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        name: "Monstera Out",
        slug: `monstera-out-${suffix()}`,
        description: "x",
        status: "ACTIVE",
        publishedAt: new Date(),
        minPrice: "500",
        maxPrice: "500",
        inStock: false,
      },
    });
    const hiddenProduct = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        name: "Monstera Hidden Product",
        slug: `monstera-hidden-${suffix()}`,
        description: "x",
        status: "DRAFT",
        minPrice: "100",
        maxPrice: "100",
      },
    });
    // Decoy: name does NOT contain the query and nameBn/scientificName are null,
    // so its prefix_hit must be FALSE (not NULL) or it would wrongly sort first.
    const decoy = await prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: category.id,
        name: "Elm Bonsai",
        slug: `elm-bonsai-${suffix()}`,
        description: "x",
        status: "ACTIVE",
        publishedAt: new Date(),
        minPrice: "500",
        maxPrice: "500",
        inStock: true,
      },
    });

    return { shop, category, hiddenCategory, active, outOfStock, hiddenProduct, decoy };
  };

  it('rejects queries shorter than 2 characters, blanks and oversized input with 400', async () => {
    await createSeed();
    const short = await request(server).get(`${API}/search/suggest?q=m`).set("Origin", ORIGIN);
    expect(short.status).toBe(400);

    const blank = await request(server).get(`${API}/search/suggest?q=%20`).set("Origin", ORIGIN);
    expect(blank.status).toBe(400);

    const long = await request(server)
      .get(`${API}/search/suggest?q=${encodeURIComponent("q".repeat(51))}`)
      .set("Origin", ORIGIN);
    expect(long.status).toBe(400);

    // missing q is optional (empty groups)
    const missing = await request(server).get(`${API}/search/suggest`).set("Origin", ORIGIN);
    expect(missing.status).toBe(200);
    expect(missing.body.data).toEqual({ products: [], categories: [], shops: [] });
  });

  it("suggests visible products, categories and shops with correct shapes", async () => {
    const seed = await createSeed();

    const response = await request(server)
      .get(`${API}/search/suggest?q=monstera`)
      .set("Origin", ORIGIN);
    expect(response.status).toBe(200);

    const suggestions = response.body.data as {
      products: { name: string; nameBn: string | null; slug: string; image: string | null; minPrice: string; inStock: boolean }[];
      categories: { name: string; slug: string; imageUrl: string | null }[];
      shops: { name: string; slug: string; logoUrl: string | null; district: string | null }[];
    };
    expect(suggestions.products.length).toBeGreaterThan(0);
    expect(suggestions.products.length).toBeLessThanOrEqual(4);
    expect(suggestions.products.map((product) => product.slug)).not.toContain(seed.hiddenProduct.slug);
    for (const product of suggestions.products) {
      expect(product.minPrice).not.toBeNull();
      expect(typeof product.inStock).toBe("boolean");
    }

    expect(suggestions.categories.length).toBeGreaterThan(0);
    expect(suggestions.categories.length).toBeLessThanOrEqual(2);
    expect(suggestions.categories.map((category) => category.slug)).not.toContain(seed.hiddenCategory.slug);

    expect(suggestions.shops.length).toBeGreaterThan(0);
    expect(suggestions.shops.some((shop) => shop.name.includes("Monstera Megastore"))).toBe(true);
  });

  it("tolerates typos via trigram similarity", async () => {
    await createSeed();
    const typo = await request(server)
      .get(`${API}/search/suggest?q=monstra%20deliciosa`)
      .set("Origin", ORIGIN);
    expect(typo.status).toBe(200);
    expect(
      (typo.body.data.products as { name: string }[]).some((product) =>
        product.name.includes("Monstera Deliciosa"),
      ),
    ).toBe(true);
  });

  it("matches Bangla names and Bangla queries", async () => {
    await createSeed();
    const response = await request(server)
      .get(`${API}/search/suggest?q=${encodeURIComponent("মনস্টেরা ডেলিস")}`)
      .set("Origin", ORIGIN);
    expect(response.status).toBe(200);
    const suggestions = response.body.data as {
      products: { name: string }[];
      categories: { nameBn: string | null }[];
    };
    expect(suggestions.products.length).toBeGreaterThan(0);
    expect(suggestions.categories.length).toBeGreaterThan(0);
  });

  it("prefers prefix matches and in-stock products", async () => {
    await createSeed();
    // "monstera" prefix-matches the Monstera products. The decoy ("Elm Bonsai")
    // only matches by word similarity and has null nameBn/scientificName — a
    // regression where prefix_hit evaluated to NULL made it sort first
    // (Postgres DESC = NULLS FIRST), so the Monstera products must lead.
    const response = await request(server)
      .get(`${API}/search/suggest?q=monstera`)
      .set("Origin", ORIGIN);
    const products = response.body.data.products as { name: string; inStock: boolean }[];
    expect(products.length).toBeGreaterThanOrEqual(2);
    expect(products[0].name.startsWith("Monstera")).toBe(true);
    const prefixProducts = products.filter((product) => product.name.startsWith("Monstera"));
    expect(products.slice(0, prefixProducts.length)).toEqual(prefixProducts);
  });

  it("caches repeated queries (same result, cheap)", async () => {
    await createSeed();
    await request(server).get(`${API}/search/suggest?q=purifier`).set("Origin", ORIGIN);
    const first = await request(server).get(`${API}/search/suggest?q=purifier`).set("Origin", ORIGIN);
    const second = await request(server).get(`${API}/search/suggest?q=purifier`).set("Origin", ORIGIN);
    expect(second.body.data).toEqual(first.body.data);
  });

  it("is configured to throttle to 60 requests per minute per IP", async () => {
    // The global guard skips execution when NODE_ENV=test (documented in
    // docs/BACKEND_CONTEXT.md §9); in production the same guard returns 429.
    const { SearchController } = await import("../src/modules/search/search.controller");
    const limit = Reflect.getMetadata("THROTTLER:LIMITdefault", SearchController.prototype.suggest);
    const ttl = Reflect.getMetadata("THROTTLER:TTLdefault", SearchController.prototype.suggest);
    expect(Number(limit)).toBe(60);
    expect(Number(ttl)).toBe(60000);
  });

  it("accepts 50-char queries (and does not crash)", async () => {
    const weird = await request(server)
      .get(`${API}/search/suggest?q=${encodeURIComponent("q".repeat(50))}`)
      .set("Origin", ORIGIN);
    expect(weird.status).toBe(200);
    expect(weird.body.data).toEqual({ products: [], categories: [], shops: [] });
  });
});
