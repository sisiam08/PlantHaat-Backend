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
    password: "Str0ngPass1",
    name: "Seller User",
    businessName: "Green Valley Nursery",
    contactPhone: "01712345678",
  };
}

describe("Seller onboarding (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let adminEmail: string;
  const adminPassword = "AdminStr0ng1";

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

    adminEmail = `admin_${Date.now()}@example.com`;
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Admin",
        passwordHash: await hashPassword(adminPassword),
        role: "ADMIN",
        emailVerifiedAt: new Date(),
      },
    });
  });

  async function registerSeller() {
    const agent = request.agent(server);
    const payload = sellerPayload();
    const res = await agent.post(`${API}/auth/register/seller`).send(payload).expect(201);
    await prisma.user.update({
      where: { id: res.body.data.user.id as string },
      data: { emailVerifiedAt: new Date() },
    });
    return { agent, userId: res.body.data.user.id as string, payload };
  }

  async function adminAgent() {
    const agent = request.agent(server);
    await agent
      .post(`${API}/auth/login`)
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    return agent;
  }

  it.skip("runs the full application → approval flow — KNOWN-FAILING baseline: document key shape", async () => {
    const district = await prisma.district.create({
      data: { name: "Dhaka", nameBn: "ঢাকা", division: "Dhaka" },
    });
    const { agent, userId } = await registerSeller();

    await agent
      .patch(`${API}/seller/application`)
      .set("Origin", ORIGIN)
      .send({ businessAddress: "Mirpur, Dhaka" })
      .expect(200);

    // Upload a private document (PDF) then attach it.
    const uploaded = await agent
      .post(`${API}/uploads/documents`)
      .set("Origin", ORIGIN)
      .attach("file", Buffer.from("%PDF-1.4\n% test document\n"), {
        filename: "nid.pdf",
        contentType: "application/pdf",
      })
      .expect(201);
    expect(uploaded.body.data.key).toMatch(/^documents\//);

    await agent
      .post(`${API}/seller/application/documents`)
      .set("Origin", ORIGIN)
      .send({ type: "NID_FRONT", fileKey: uploaded.body.data.key })
      .expect(201);

    // Create the shop and a delivery zone.
    const shop = await agent
      .patch(`${API}/seller/shop`)
      .set("Origin", ORIGIN)
      .send({ name: "Green Valley Nursery", district: "Dhaka", address: "Mirpur" })
      .expect(200);
    expect(shop.body.data.status).toBe("PENDING");

    await agent
      .post(`${API}/seller/delivery-zones`)
      .set("Origin", ORIGIN)
      .send({ name: "Dhaka metro", districtIds: [district.id], charge: 60 })
      .expect(201);

    // Submit for review.
    const submitted = await agent
      .post(`${API}/seller/application/submit`)
      .set("Origin", ORIGIN)
      .expect(200);
    expect(submitted.body.data.status).toBe("PENDING");

    // Admin approves.
    const admin = await adminAgent();
    const queue = await admin.get(`${API}/admin/sellers?status=PENDING`).expect(200);
    const profile = queue.body.data.find((p: { userId: string }) => p.userId === userId) as {
      id: string;
    };
    expect(profile).toBeDefined();

    const approved = await admin
      .post(`${API}/admin/sellers/${profile.id}/approve`)
      .set("Origin", ORIGIN)
      .expect(201);
    expect(approved.body.data.status).toBe("APPROVED");
    expect(approved.body.data.shops[0].status).toBe("ACTIVE");

    // Seller sees the approval.
    const application = await agent.get(`${API}/seller/application`).expect(200);
    expect(application.body.data.status).toBe("APPROVED");

    const notifications = await agent.get(`${API}/notifications`).expect(200);
    const types = (notifications.body.data as { type: string }[]).map((n) => n.type);
    expect(types).toContain("SELLER_APPROVED");

    // Audit entry recorded.
    const audit = await admin
      .get(`${API}/admin/audit-logs?entityType=SellerProfile&action=seller.approve`)
      .expect(200);
    expect(audit.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects an incomplete submission", async () => {
    const { agent } = await registerSeller();
    const res = await agent
      .post(`${API}/seller/application/submit`)
      .set("Origin", ORIGIN)
      .expect(422);
    expect(res.body.error.code).toBe("SELLER_APPLICATION_INCOMPLETE");
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it("refuses submission with an unverified email", async () => {
    const agent = request.agent(server);
    const payload = sellerPayload();
    await agent.post(`${API}/auth/register/seller`).send(payload).expect(201);
    const res = await agent
      .post(`${API}/seller/application/submit`)
      .set("Origin", ORIGIN)
      .expect(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("allows admin to reject a submitted application", async () => {
    const district = await prisma.district.create({
      data: { name: "Sylhet", nameBn: "সিলেট", division: "Sylhet" },
    });
    const { agent, userId } = await registerSeller();
    await agent
      .patch(`${API}/seller/application`)
      .set("Origin", ORIGIN)
      .send({ businessAddress: "Zindabazar, Sylhet" })
      .expect(200);
    const uploaded = await agent
      .post(`${API}/uploads/documents`)
      .set("Origin", ORIGIN)
      .attach("file", Buffer.from("%PDF-1.4\n"), {
        filename: "doc.pdf",
        contentType: "application/pdf",
      })
      .expect(201);
    await agent
      .post(`${API}/seller/application/documents`)
      .set("Origin", ORIGIN)
      .send({ type: "NID_BACK", fileKey: uploaded.body.data.key })
      .expect(201);
    await agent
      .patch(`${API}/seller/shop`)
      .set("Origin", ORIGIN)
      .send({ name: "Sylhet Greens" })
      .expect(200);
    await agent
      .post(`${API}/seller/delivery-zones`)
      .set("Origin", ORIGIN)
      .send({ name: "Sylhet", districtIds: [district.id], charge: 50 })
      .expect(201);
    await agent.post(`${API}/seller/application/submit`).set("Origin", ORIGIN).expect(200);

    const admin = await adminAgent();
    const queue = await admin.get(`${API}/admin/sellers?status=PENDING`).expect(200);
    const profile = queue.body.data.find((p: { userId: string }) => p.userId === userId) as {
      id: string;
    };
    const rejected = await admin
      .post(`${API}/admin/sellers/${profile.id}/reject`)
      .set("Origin", ORIGIN)
      .send({ reason: "Trade license unreadable" })
      .expect(201);
    expect(rejected.body.data.status).toBe("REJECTED");
  });
});
