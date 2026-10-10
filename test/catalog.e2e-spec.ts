import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import sharp from "sharp";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { AppConfigService } from "../src/config/app-config.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./cleanup";

const API = "/api/v1";
const ORIGIN = "http://localhost:3000";

function registerPayload() {
  return {
    email: `user_${Date.now()}_${Math.random().toString(16).slice(2, 8)}@example.com`,
    password: "Str0ngPass1",
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

  it("uploads and re-encodes an image", async () => {
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

  it("sets the avatar via /users/me/avatar", async () => {
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
