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
import {
  mapDistrictToSteadfast,
  useTestDeliveryRates,
} from "./delivery-fixtures";
import { clearSettings, setSettings } from "./settings-test-helper";

const API = "/api/v1";
const ORIGIN = "http://localhost:3000";

describe("Courier delivery quotes (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let categoryId: string;

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
    await useTestDeliveryRates(app, prisma, { insideDhaka: 60, outsideDhaka: 90 });
    const category = await prisma.category.create({
      data: { name: "Plants", slug: `plants-${randomUUID()}`, isActive: true },
    });
    categoryId = category.id;
  });

  afterEach(async () => {
    await clearSettings(app, prisma);
  });

  async function createShop(districtId: number, options?: { pickupThanaId?: string }) {
    const id = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `seller_${id}@example.com`,
        name: "Seller",
        passwordHash: await hashPassword("SellerPass1!"),
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
        pickupDistrictId: districtId,
        pickupThanaId: options?.pickupThanaId ?? null,
      },
    });
    await prisma.shopDeliveryZone.create({
      data: {
        shopId: shop.id,
        name: "Zone",
        charge: 999,
        freeDeliveryAbove: null,
        districts: { create: [{ districtId }] },
      },
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
        minPrice: 100,
        maxPrice: 100,
        inStock: true,
        weightKg: 0.5,
        extraChargeAfterQty: 2,
        extraChargePerUnit: 10,
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, name: "Standard", price: 100, stockQty: 10 },
    });
    return { shop, product, variant };
  }

  it("previews a guest quote without authentication and adds the seller extra", async () => {
    const district = await prisma.district.create({
      data: { name: `Chattogram-${randomUUID()}`, nameBn: "x", division: "Chattogram" },
    });
    await mapDistrictToSteadfast(prisma, district.id, 2);
    const { shop, variant } = await createShop(district.id);

    const response = await request(server)
      .post(`${API}/delivery-quote/preview`)
      .send({
        districtId: district.id,
        shops: [{ shopId: shop.id, items: [{ variantId: variant.id, quantity: 4 }] }],
      })
      .expect(200);

    const quote = response.body.data.shops[0];
    expect(quote.available).toBe(true);
    // outside fallback 90 + (4 - 2) * 10 = 110
    expect(Number(quote.deliveryCharge)).toBe(110);
    expect(Number(quote.sellerExtraCharge)).toBe(20);
    expect(Number(quote.parcelWeightKg)).toBe(2);
  });

  it("requires a thana for a Dhaka destination", async () => {
    const district = await prisma.district.create({
      data: { name: "Dhaka", nameBn: "x", division: "Dhaka" },
    });
    const thana = await prisma.thana.create({
      data: {
        name: "Mirpur",
        districtId: district.id,
        dhakaZone: "CITY",
        steadfastPoliceStationId: 900001,
      },
    });
    const { shop, variant } = await createShop(district.id, {
      pickupThanaId: thana.id,
    });

    const missing = await request(server)
      .post(`${API}/delivery-quote/preview`)
      .send({
        districtId: district.id,
        shops: [{ shopId: shop.id, items: [{ variantId: variant.id, quantity: 1 }] }],
      })
      .expect(200);
    expect(missing.body.data.shops[0].available).toBe(false);
    expect(missing.body.data.shops[0].reason).toBe("ADDRESS_THANA_REQUIRED");

    const withThana = await request(server)
      .post(`${API}/delivery-quote/preview`)
      .send({
        districtId: district.id,
        thanaId: thana.id,
        shops: [{ shopId: shop.id, items: [{ variantId: variant.id, quantity: 1 }] }],
      })
      .expect(200);
    expect(withThana.body.data.shops[0].available).toBe(true);
    expect(Number(withThana.body.data.shops[0].deliveryCharge)).toBe(60);
  });

  it("rejects a Dhaka address without a thana", async () => {
    const district = await prisma.district.create({
      data: { name: "Dhaka", nameBn: "x", division: "Dhaka" },
    });
    const agent = request.agent(server);
    const email = `cust_${randomUUID()}@example.com`;
    const reg = await agent
      .post(`${API}/auth/register`)
      .send({ email, password: "Str0ngPass1!", name: "Customer" })
      .expect(201);
    await prisma.user.update({
      where: { id: reg.body.data.user.id as string },
      data: { emailVerifiedAt: new Date() },
    });

    const response = await agent
      .post(`${API}/addresses`)
      .set("Origin", ORIGIN)
      .send({
        recipientName: "Customer",
        phone: "01712345678",
        districtId: district.id,
        area: "Mirpur",
        addressLine: "House 1",
        isDefault: true,
      })
      .expect(400);
    expect(response.body.error.code).toBe("ADDRESS_THANA_REQUIRED");
  });

  it("returns DELIVERY_CHARGE_CHANGED when the quote moved after the cart", async () => {
    const district = await prisma.district.create({
      data: { name: `Sylhet-${randomUUID()}`, nameBn: "x", division: "Sylhet" },
    });
    await mapDistrictToSteadfast(prisma, district.id, 2);
    const { variant } = await createShop(district.id);

    const agent = request.agent(server);
    const email = `cust_${randomUUID()}@example.com`;
    const reg = await agent
      .post(`${API}/auth/register`)
      .send({ email, password: "Str0ngPass1!", name: "Customer" })
      .expect(201);
    const userId = reg.body.data.user.id as string;
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
    const address = await prisma.address.create({
      data: {
        userId,
        recipientName: "Customer",
        phone: "01712345678",
        districtId: district.id,
        area: "Zindabazar",
        addressLine: "House 1",
        isDefault: true,
      },
    });
    await agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: variant.id, quantity: 1 })
      .expect(200);

    await setSettings(app, prisma, {
      "delivery.fallback.outsideDhaka": 150,
    });

    const response = await agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({
        addressId: address.id,
        paymentMethod: "COD",
        expectedDeliveryTotal: 90,
      })
      .expect(409);
    expect(response.body.error.code).toBe("DELIVERY_CHARGE_CHANGED");
    expect(Number(response.body.error.details.deliveryTotal)).toBe(150);
  });
});
