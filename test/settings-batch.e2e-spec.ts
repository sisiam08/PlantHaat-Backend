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
import { clearSettings, restoreDefaultSettings } from "./settings-test-helper";

const API = "/api/v1";
const ORIGIN = "http://localhost:3000";

describe("Settings batch save (real DB)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let admin: ReturnType<typeof request.agent>;

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
    const email = `admin_${randomUUID().slice(0, 8)}@example.com`;
    await prisma.user.create({
      data: {
        email,
        name: "Admin",
        passwordHash: await hashPassword("AdminStr0ng1!"),
        role: "ADMIN",
        emailVerifiedAt: new Date(),
      },
    });
    admin = request.agent(server);
    await admin.post(`${API}/auth/login`).send({ email, password: "AdminStr0ng1!" }).expect(200);
  });

  afterEach(async () => {
    await clearSettings(app, prisma);
    await restoreDefaultSettings(app, prisma);
  });

  function token(keys: string[], password = "AdminStr0ng1!") {
    return admin
      .post(`${API}/admin/settings/reauth`)
      .set("Origin", ORIGIN)
      .send({ keys, password });
  }

  it("saves number + provider + advance together and returns the saved values", async () => {
    const reauth = await token(["payment.bkash.number"]).expect(200);
    const saved = await admin
      .patch(`${API}/admin/settings`)
      .set("Origin", ORIGIN)
      .set("x-settings-reauth", reauth.body.data.token)
      .send({
        values: {
          "payment.bkash.number": "01700000000",
          "payment.bkash.enabled": true,
          "payment.advance.enabled": true,
        },
      })
      .expect(200);
    expect(saved.body.data["payment.bkash.number"]).toBe("01700000000");
    expect(saved.body.data["payment.bkash.enabled"]).toBe(true);
    expect(saved.body.data["payment.advance.enabled"]).toBe(true);

    const reload = await admin.get(`${API}/admin/settings`).expect(200);
    expect(reload.body.data["payment.bkash.number"]).toBe("01700000000");
    expect(reload.body.data["payment.bkash.enabled"]).toBe(true);
    expect(reload.body.data["payment.advance.enabled"]).toBe(true);
  });

  it("validates against the merged request state before writing anything", async () => {
    const missing = await admin
      .patch(`${API}/admin/settings`)
      .set("Origin", ORIGIN)
      .send({
        values: { "payment.bkash.enabled": true, "payment.advance.enabled": true },
      })
      .expect(400);
    expect(missing.body.error.details["payment.bkash.enabled"]).toMatch(/valid receiving number/);
    expect(missing.body.error.details["payment.advance.enabled"]).toMatch(/provider/);

    const unchanged = await admin.get(`${API}/admin/settings`).expect(200);
    expect(unchanged.body.data["payment.bkash.enabled"]).toBe(false);
    expect(unchanged.body.data["payment.advance.enabled"]).toBe(false);
    expect(unchanged.body.data["payment.bkash.number"]).toBe("");

    const reauth = await token(["payment.bkash.number"]).expect(200);
    const merged = await admin
      .patch(`${API}/admin/settings`)
      .set("Origin", ORIGIN)
      .set("x-settings-reauth", reauth.body.data.token)
      .send({
        values: {
          "payment.bkash.number": "01700000001",
          "payment.bkash.enabled": true,
          "payment.advance.enabled": true,
        },
      })
      .expect(200);
    expect(merged.body.data["payment.bkash.number"]).toBe("01700000001");
    expect(merged.body.data["payment.bkash.enabled"]).toBe(true);
    expect(merged.body.data["payment.advance.enabled"]).toBe(true);
  });

  it("rejects token reuse and key tampering", async () => {
    const reauth = await token(["payment.bkash.number"]).expect(200);
    const used = await admin
      .patch(`${API}/admin/settings`)
      .set("Origin", ORIGIN)
      .set("x-settings-reauth", reauth.body.data.token)
      .send({ values: { "payment.bkash.number": "01700000002" } })
      .expect(200);
    expect(used.body.data["payment.bkash.number"]).toBe("01700000002");

    const reused = await admin
      .patch(`${API}/admin/settings`)
      .set("Origin", ORIGIN)
      .set("x-settings-reauth", reauth.body.data.token)
      .send({ values: { "payment.bkash.number": "01700000003" } })
      .expect(400);
    expect(reused.body.error.message).toMatch(/Re-authentication/);

    const fresh = await token(["payment.bkash.number"]).expect(200);
    const tampered = await admin
      .patch(`${API}/admin/settings`)
      .set("Origin", ORIGIN)
      .set("x-settings-reauth", fresh.body.data.token)
      .send({
        values: {
          "payment.bkash.number": "01700000004",
          "payment.nagad.number": "01700000005",
        },
      })
      .expect(400);
    expect(tampered.body.error.message).toMatch(/does not match/);
  });

  it("writes one history row per key with a shared batchId", async () => {
    const reauth = await token(["payment.bkash.number"]).expect(200);
    await admin
      .patch(`${API}/admin/settings`)
      .set("Origin", ORIGIN)
      .set("x-settings-reauth", reauth.body.data.token)
      .send({
        values: {
          "payment.bkash.number": "01700000006",
          "payment.bkash.enabled": true,
          "payment.advance.enabled": true,
        },
      })
      .expect(200);

    const rows = await prisma.systemSettingHistory.findMany({
      where: {
        key: {
          in: [
            "payment.bkash.number",
            "payment.bkash.enabled",
            "payment.advance.enabled",
          ],
        },
      },
    });
    expect(rows).toHaveLength(3);
    const batchIds = new Set(rows.map((row) => row.batchId));
    expect(batchIds.size).toBe(1);
    expect([...batchIds][0]).toBeTruthy();
  });

  it("masks sensitive values in the history viewer", async () => {
    const reauth = await token(["payment.bkash.number"]).expect(200);
    await admin
      .patch(`${API}/admin/settings`)
      .set("Origin", ORIGIN)
      .set("x-settings-reauth", reauth.body.data.token)
      .send({ values: { "payment.bkash.number": "01700000007" } })
      .expect(200);

    const history = await admin.get(`${API}/admin/settings/history`).expect(200);
    const row = history.body.data.find(
      (entry: { key: string }) => entry.key === "payment.bkash.number",
    );
    expect(row.newValue).not.toBe("01700000007");
  });
});
