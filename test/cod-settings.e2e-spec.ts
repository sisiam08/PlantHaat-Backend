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
import { SettingsService } from "../src/modules/settings/settings.service";
import { resetDatabase } from "./cleanup";
import { clearSettings, setSettings, testPrefix } from "./settings-test-helper";
import {
  mapDistrictToSteadfast,
  useTestDeliveryRates,
} from "./delivery-fixtures";

const API = "/api/v1";
const ORIGIN = "http://localhost:3000";

describe("COD settings (real DB)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let categoryId: string;
  let districtId: number;
  const prefix = testPrefix("cod");

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
    await clearSettings(app, prisma);
    await resetDatabase(prisma);
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await clearSettings(app, prisma);
    await setSettings(app, prisma, {
      "payment.cod.enabled": true,
      "payment.advance.enabled": false,
      "order.codMaxAmount": 0,
    });
    await useTestDeliveryRates(app, prisma);
    const category = await prisma.category.create({
      data: { name: `Plants ${prefix}`, slug: `plants-${prefix}-${randomUUID()}`, isActive: true },
    });
    categoryId = category.id;
    const district = await prisma.district.create({
      data: {
        name: `Dhaka ${randomUUID()}`,
        nameBn: "ঢাকা",
        division: "Dhaka",
      },
    });
    districtId = district.id;
    await mapDistrictToSteadfast(prisma, districtId);
  });

  afterEach(async () => {
    await clearSettings(app, prisma);
  });

  async function createShopWithProduct(price: number, stock: number) {
    const id = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: `seller_${id.slice(0, 8)}@example.com`,
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
        district: "Dhaka",
        pickupDistrictId: districtId,
      },
    });
    await prisma.shopDeliveryZone.create({
      data: {
        shopId: shop.id,
        name: "Zone",
        charge: 60,
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
        minPrice: price,
        maxPrice: price,
        inStock: stock > 0,
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, name: "Standard", price, stockQty: stock },
    });
    return { shop, product, variant };
  }

  async function createCustomer() {
    const agent = request.agent(server);
    const email = `cust_${randomUUID().slice(0, 18)}@example.com`;
    const reg = await agent
      .post(`${API}/auth/register`)
      .send({ email, password: "Str0ngPass1!", name: "Customer" })
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

  async function addToCart(
    customer: Awaited<ReturnType<typeof createCustomer>>,
    variantId: string,
    quantity: number,
  ) {
    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId, quantity })
      .expect(200);
    const cart = await customer.agent
      .get(`${API}/cart?districtId=${districtId}`)
      .set("Origin", ORIGIN)
      .expect(200);
    return Number(cart.body.data.grandTotal) as number;
  }

  async function checkout(customer: Awaited<ReturnType<typeof createCustomer>>) {
    return customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ addressId: customer.addressId, paymentMethod: "COD" });
  }

  it("accepts COD by default", async () => {
    const shop = await createShopWithProduct(100, 10);
    const customer = await createCustomer();
    await addToCart(customer, shop.variant.id, 1);

    const order = await checkout(customer);
    expect(order.status).toBe(200);
    expect(order.body.data.paymentMethod).toBe("COD");
  });

  it("treats codMaxAmount = 0 as no limit", async () => {
    await setSettings(app, prisma, { "order.codMaxAmount": 0 });
    const shop = await createShopWithProduct(100, 10);
    const customer = await createCustomer();
    await addToCart(customer, shop.variant.id, 5);

    const order = await checkout(customer);
    expect(order.status).toBe(200);
  });

  it("accepts the exact server grand total and rejects one taka over", async () => {
    const shop = await createShopWithProduct(100, 10);
    const customer = await createCustomer();
    const grandTotal = await addToCart(customer, shop.variant.id, 1);
    expect(grandTotal).toBe(160); // 100 item + 60 delivery

    await setSettings(app, prisma, { "order.codMaxAmount": grandTotal });
    const accepted = await checkout(customer);
    expect(accepted.status).toBe(200);

    const customer2 = await createCustomer();
    await addToCart(customer2, shop.variant.id, 1);
    await setSettings(app, prisma, { "order.codMaxAmount": grandTotal - 1 });
    const rejected = await checkout(customer2);
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe("PAYMENT_METHOD_NOT_AVAILABLE");
  });

  it("rejects COD when it is disabled", async () => {
    await setSettings(app, prisma, { "payment.cod.enabled": false });
    const shop = await createShopWithProduct(100, 10);
    const customer = await createCustomer();
    await addToCart(customer, shop.variant.id, 1);

    const order = await checkout(customer);
    expect(order.status).toBe(400);
    expect(order.body.error.code).toBe("PAYMENT_METHOD_NOT_AVAILABLE");
  });

  it("cannot disable COD while effectiveAdvance is false", async () => {
    const admin = await prisma.user.create({
      data: {
        email: `admin_${randomUUID().slice(0, 8)}@example.com`,
        name: "Admin",
        passwordHash: await hashPassword("AdminStr0ng1!"),
        role: "ADMIN",
        emailVerifiedAt: new Date(),
      },
    });
    const settings = app.get(SettingsService);
    await expect(
      settings.update({ "payment.cod.enabled": false }, admin.id),
    ).rejects.toThrow(/Some settings are invalid/);
  });

  it("applies commission.default to new orders with strict money rounding", async () => {
    await setSettings(app, prisma, { "commission.default": 12.5 });
    const shop = await createShopWithProduct(100, 10);
    const customer = await createCustomer();
    await addToCart(customer, shop.variant.id, 1);

    const order = await checkout(customer);
    expect(order.status).toBe(200);
    const shopOrder = order.body.data.shopOrders[0];
    expect(shopOrder.commissionAmount).toBe("12.5");
    expect(shopOrder.total).toBe("160");
    expect(shopOrder.sellerNetAmount).toBe("147.5");
    expect(Number(shopOrder.commissionAmount) + Number(shopOrder.sellerNetAmount)).toBe(
      Number(shopOrder.total),
    );
  });

  it("surfaces the zero-payment-methods state instead of pretending COD exists", async () => {
    await setSettings(app, prisma, {
      "payment.cod.enabled": false,
      "payment.advance.enabled": false,
    });
    const publicSettings = await request(server).get(`${API}/settings/public`).expect(200);
    expect(publicSettings.body.data["payment.cod.enabled"]).toBe(false);
    expect(publicSettings.body.data["payment.advance.enabled"]).toBe(false);

    const shop = await createShopWithProduct(100, 10);
    const customer = await createCustomer();
    await addToCart(customer, shop.variant.id, 1);
    const order = await checkout(customer);
    expect(order.status).toBe(400);
    expect(order.body.error.code).toBe("PAYMENT_METHOD_NOT_AVAILABLE");
  });
});

