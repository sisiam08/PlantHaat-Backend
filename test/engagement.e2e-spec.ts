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

const API = "/api/v1";
const ORIGIN = "http://localhost:3000";

function suffix(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

describe("Wishlist, reviews & complaints (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let categoryId: string;
  let districtId: number;

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
    const category = await prisma.category.create({
      data: { name: "Plants", slug: `plants-${suffix()}`, isActive: true },
    });
    categoryId = category.id;
    const district = await prisma.district.create({
      data: { name: `Dhaka-${suffix()}`, nameBn: "ঢাকা", division: "Dhaka" },
    });
    districtId = district.id;
    await useTestDeliveryRates(app, prisma);
    await mapDistrictToSteadfast(prisma, districtId);
  });

  async function setupSeller(price = 1000) {
    const id = suffix();
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
      },
    });
    await prisma.shopDeliveryZone.create({
      data: { shopId: shop.id, name: "Zone", charge: 60, districts: { create: [{ districtId }] } },
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
        inStock: true,
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, name: "Standard", price, stockQty: 5 },
    });
    const agent = request.agent(server);
    await agent
      .post(`${API}/auth/login`)
      .send({ email: user.email, password: "SellerPass1!" })
      .expect(200);
    return { user, profile, shop, product, variant, agent };
  }

  async function createCustomer() {
    const agent = request.agent(server);
    const email = `cust_${suffix()}@example.com`;
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

  async function deliveredOrder(seller: Awaited<ReturnType<typeof setupSeller>>) {
    const customer = await createCustomer();
    await customer.agent
      .put(`${API}/cart/items`)
      .set("Origin", ORIGIN)
      .send({ variantId: seller.variant.id, quantity: 1 })
      .expect(200);
    const order = await customer.agent
      .post(`${API}/checkout`)
      .set("Origin", ORIGIN)
      .set("Idempotency-Key", randomUUID())
      .send({ addressId: customer.addressId })
      .expect(200);
    const shopOrder = order.body.data.shopOrders[0];
    for (const status of ["CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"]) {
      await seller.agent
        .post(`${API}/seller/orders/${shopOrder.id}/status`)
        .set("Origin", ORIGIN)
        .send({ status })
        .expect(200);
    }
    return {
      customer,
      shopOrderId: shopOrder.id as string,
      orderItemId: shopOrder.items[0].id as string,
    };
  }

  async function adminAgent() {
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

  it("manages the wishlist", async () => {
    const seller = await setupSeller();
    const { agent } = await createCustomer();

    await agent.post(`${API}/wishlist/${seller.product.id}`).set("Origin", ORIGIN).expect(200);
    await agent.post(`${API}/wishlist/${seller.product.id}`).set("Origin", ORIGIN).expect(200);

    const list = await agent.get(`${API}/wishlist`).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].available).toBe(true);

    await agent.delete(`${API}/wishlist/${seller.product.id}`).set("Origin", ORIGIN).expect(204);
    const after = await agent.get(`${API}/wishlist`).expect(200);
    expect(after.body.data).toHaveLength(0);
  });

  it("reviews a delivered item once and updates product ratings", async () => {
    const seller = await setupSeller();
    const { customer, orderItemId } = await deliveredOrder(seller);

    await customer.agent
      .post(`${API}/orders/items/${orderItemId}/review`)
      .set("Origin", ORIGIN)
      .send({ rating: 4, comment: "Healthy plant!" })
      .expect(201);

    await customer.agent
      .post(`${API}/orders/items/${orderItemId}/review`)
      .set("Origin", ORIGIN)
      .send({ rating: 5 })
      .expect(409);

    const product = await prisma.product.findUniqueOrThrow({ where: { id: seller.product.id } });
    expect(Number(product.ratingAvg)).toBe(4);
    expect(product.ratingCount).toBe(1);

    const publicReviews = await request(server)
      .get(`${API}/products/${seller.product.slug}/reviews`)
      .expect(200);
    expect(publicReviews.body.data).toHaveLength(1);

    // The wishlist list item carries the denormalized rating fields so cards
    // can render the rating row without a second request.
    await customer.agent
      .post(`${API}/wishlist/${seller.product.id}`)
      .set("Origin", ORIGIN)
      .expect(200);
    const wishlist = await customer.agent.get(`${API}/wishlist`).expect(200);
    const wishlisted = wishlist.body.data.find(
      (item: { product: { id: string } }) => item.product.id === seller.product.id,
    );
    expect(wishlisted).toBeDefined();
    expect(Number(wishlisted.product.ratingAvg)).toBe(4);
    expect(wishlisted.product.ratingCount).toBe(1);

    // A different customer cannot review this order item.
    const other = await createCustomer();
    await other.agent
      .post(`${API}/orders/items/${orderItemId}/review`)
      .set("Origin", ORIGIN)
      .send({ rating: 5 })
      .expect(404);
  });

  it("enforces the review window", async () => {
    const seller = await setupSeller();
    const { customer, orderItemId, shopOrderId } = await deliveredOrder(seller);
    await prisma.shopOrder.update({
      where: { id: shopOrderId },
      data: { deliveredAt: new Date(Date.now() - 90 * 86_400_000) },
    });
    const res = await customer.agent
      .post(`${API}/orders/items/${orderItemId}/review`)
      .set("Origin", ORIGIN)
      .send({ rating: 5 })
      .expect(400);
    expect(res.body.error.code).toBe("REVIEW_WINDOW_CLOSED");
  });

  it("opens a complaint, replies and resolves it with a refund", async () => {
    const seller = await setupSeller();
    const { customer, shopOrderId } = await deliveredOrder(seller);

    await customer.agent
      .post(`${API}/complaints`)
      .set("Origin", ORIGIN)
      .send({ shopOrderId, type: "DAMAGED_PLANT", description: "The plant arrived broken." })
      .expect(400);

    const complaint = await customer.agent
      .post(`${API}/complaints`)
      .set("Origin", ORIGIN)
      .send({
        shopOrderId,
        type: "DAMAGED_PLANT",
        description: "The plant arrived broken.",
        attachments: ["https://cdn.test/damage.webp"],
      })
      .expect(201);
    const complaintId = complaint.body.data.id as string;

    // Another customer cannot read it.
    const other = await createCustomer();
    await other.agent.get(`${API}/complaints/${complaintId}`).expect(404);

    await seller.agent
      .post(`${API}/seller/complaints/${complaintId}/comments`)
      .set("Origin", ORIGIN)
      .send({ body: "Sorry, we will refund you." })
      .expect(201);

    const admin = await adminAgent();
    await admin
      .post(`${API}/admin/complaints/${complaintId}/resolve`)
      .set("Origin", ORIGIN)
      .send({ status: "RESOLVED_REFUND", resolutionNote: "Refund issued", refundAmount: 500 })
      .expect(200);

    const refund = await prisma.refund.findFirst({ where: { complaintId } });
    expect(refund).not.toBeNull();
    expect(refund?.status).toBe("REQUESTED");
    expect(Number(refund?.amount)).toBe(500);
  });
});

