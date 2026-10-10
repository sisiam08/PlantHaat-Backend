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

function suffix(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function responseCookie(response: request.Response, name: string): string | undefined {
  const header = response.headers["set-cookie"];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) {
      return cookie.split(";")[0].slice(name.length + 1);
    }
  }
  return undefined;
}

describe("Trusted client IP behind the BFF (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  const bffKey = process.env.BFF_SHARED_SECRET ?? "";

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

  async function lastSessionIp(email: string): Promise<string | null> {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const session = await prisma.refreshSession.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return session?.ipAddress ?? null;
  }

  it("records the forwarded client IP only with the correct BFF key", async () => {
    const email = `bff_${suffix()}@example.com`;
    await request(server)
      .post(`${API}/auth/register`)
      .set("X-BFF-Key", bffKey)
      .set("X-Forwarded-For", "203.0.113.7")
      .send({ email, password: "Str0ngPass1", name: "BFF User" })
      .expect(201);

    expect(await lastSessionIp(email)).toBe("203.0.113.7");
  });

  it("ignores X-Forwarded-For without the BFF key", async () => {
    const email = `bff_${suffix()}@example.com`;
    await request(server)
      .post(`${API}/auth/register`)
      .set("X-Forwarded-For", "203.0.113.9")
      .send({ email, password: "Str0ngPass1", name: "BFF User" })
      .expect(201);

    const ip = await lastSessionIp(email);
    expect(ip).not.toBe("203.0.113.9");
    expect(ip).not.toBeNull();
  });

  it("allows an authenticated Bearer mutation with no Origin header", async () => {
    const email = `bff_${suffix()}@example.com`;
    const registered = await request(server)
      .post(`${API}/auth/register`)
      .send({ email, password: "Str0ngPass1", name: "BFF User" })
      .expect(201);
    const accessToken = responseCookie(registered, "ph_at");
    expect(accessToken).toBeDefined();

    await request(server)
      .patch(`${API}/users/me`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Renamed" })
      .expect(200);
  });

  it("rejects a cookie-authenticated mutation with no Origin header", async () => {
    const agent = request.agent(server);
    await agent
      .post(`${API}/auth/register`)
      .send({ email: `bff_${suffix()}@example.com`, password: "Str0ngPass1", name: "BFF User" })
      .expect(201);

    const res = await agent.patch(`${API}/users/me`).send({ name: "Nope" }).expect(403);
    expect(res.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });
});
