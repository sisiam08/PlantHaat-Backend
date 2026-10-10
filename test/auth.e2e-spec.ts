import { jest } from "@jest/globals";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { AppConfigService } from "../src/config/app-config.service";
import { MailService } from "../src/modules/mail/mail.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./cleanup";

const API = "/api/v1";

interface RegisterPayload {
  email: string;
  password: string;
  name: string;
}

function buildPayload(overrides: Partial<RegisterPayload> = {}): RegisterPayload {
  return {
    email: `user_${Date.now()}_${Math.random().toString(16).slice(2, 8)}@example.com`,
    password: "Str0ngPass1",
    name: "Test User",
    ...overrides,
  };
}

function responseCookies(response: request.Response): string[] {
  const header: string | string[] | undefined = response.headers["set-cookie"];
  if (Array.isArray(header)) {
    return header;
  }
  return header ? [header] : [];
}

function extractCookie(response: request.Response, name: string): string | undefined {
  for (const cookie of responseCookies(response)) {
    if (cookie.startsWith(`${name}=`)) {
      return cookie.split(";")[0].slice(name.length + 1);
    }
  }
  return undefined;
}

function extractToken(text: string): string {
  const match = /token=([^\s]+)/.exec(text);
  if (!match) {
    throw new Error(`No token found in mail text: ${text}`);
  }
  return match[1];
}

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let mail: MailService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(AppConfigService), { swagger: false, helmet: false });
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
    mail = app.get(MailService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
  });

  it("registers a customer, sets auth cookies and returns the current user", async () => {
    const agent = request.agent(server);
    const payload = buildPayload();

    const res = await agent.post(`${API}/auth/register`).send(payload).expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(payload.email);
    expect(res.body.data.user.role).toBe("CUSTOMER");
    expect(res.body.data.accessTokenExpiresAt).toEqual(expect.any(Number));

    const access = extractCookie(res, "ph_at");
    const refresh = extractCookie(res, "ph_rt");
    expect(access).toBeDefined();
    expect(refresh).toBeDefined();
    expect(responseCookies(res).join(";")).toContain("HttpOnly");

    const me = await agent.get(`${API}/auth/me`).expect(200);
    expect(me.body.data.email).toBe(payload.email);
  });

  it("rejects unauthenticated access with UNAUTHENTICATED", async () => {
    const res = await request(server).get(`${API}/auth/me`).expect(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects duplicate email registration", async () => {
    const payload = buildPayload();
    await request(server).post(`${API}/auth/register`).send(payload).expect(201);
    const res = await request(server).post(`${API}/auth/register`).send(payload).expect(409);
    expect(res.body.error.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  it("logs in and rejects a wrong password", async () => {
    const payload = buildPayload();
    await request(server).post(`${API}/auth/register`).send(payload).expect(201);

    await request(server)
      .post(`${API}/auth/login`)
      .send({ email: payload.email, password: payload.password })
      .expect(200);

    const res = await request(server)
      .post(`${API}/auth/login`)
      .send({ email: payload.email, password: "WrongPass1" })
      .expect(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("locks the account after 5 consecutive failed logins", async () => {
    const payload = buildPayload();
    await request(server).post(`${API}/auth/register`).send(payload).expect(201);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await request(server)
        .post(`${API}/auth/login`)
        .send({ email: payload.email, password: "WrongPass1" })
        .expect(401);
    }

    const locked = await request(server)
      .post(`${API}/auth/login`)
      .send({ email: payload.email, password: "WrongPass1" })
      .expect(423);
    expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
  });

  it("rotates refresh tokens, allows a benign grace re-use, then detects reuse", async () => {
    const agent = request.agent(server);
    const payload = buildPayload();
    const registered = await agent.post(`${API}/auth/register`).send(payload).expect(201);
    const oldRefresh = extractCookie(registered, "ph_rt")!;

    const rotated = await agent.post(`${API}/auth/refresh`).expect(200);
    const newRefresh = extractCookie(rotated, "ph_rt");
    expect(newRefresh).toBeDefined();
    expect(newRefresh).not.toBe(oldRefresh);

    // Benign parallel refresh with the old token within the grace window: access token only.
    const grace = await request(server)
      .post(`${API}/auth/refresh`)
      .set("Cookie", `ph_rt=${oldRefresh}`)
      .expect(200);
    expect(grace.body.data.accessTokenExpiresAt).toEqual(expect.any(Number));
    expect(extractCookie(grace, "ph_rt")).toBeUndefined();

    // Age the rotation beyond the grace window, then reuse → theft detected.
    await prisma.refreshSession.updateMany({
      where: { rotatedAt: { not: null } },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });

    const reused = await request(server)
      .post(`${API}/auth/refresh`)
      .set("Cookie", `ph_rt=${oldRefresh}`)
      .expect(401);
    expect(reused.body.error.code).toBe("REFRESH_TOKEN_REUSED");

    // The whole family is revoked, so the successor token is dead too.
    const afterRevoke = await request(server)
      .post(`${API}/auth/refresh`)
      .set("Cookie", `ph_rt=${newRefresh}`)
      .expect(401);
    expect(afterRevoke.body.error.code).toBe("SESSION_EXPIRED");
  });

  it("logout revokes the refresh token", async () => {
    const agent = request.agent(server);
    const payload = buildPayload();
    const registered = await agent.post(`${API}/auth/register`).send(payload).expect(201);
    const refresh = extractCookie(registered, "ph_rt")!;

    await agent.post(`${API}/auth/logout`).expect(204);

    const res = await request(server)
      .post(`${API}/auth/refresh`)
      .set("Cookie", `ph_rt=${refresh}`)
      .expect(401);
    expect(res.body.error.code).toBe("SESSION_EXPIRED");
  });

  it("verifies email and resets the password", async () => {
    const queueSpy = jest.spyOn(mail, "queue");
    const agent = request.agent(server);
    const payload = buildPayload();
    const registered = await agent.post(`${API}/auth/register`).send(payload).expect(201);

    const verificationToken = extractToken(queueSpy.mock.calls.at(-1)![0].text);
    await request(server)
      .post(`${API}/auth/verify-email`)
      .send({ token: verificationToken })
      .expect(200);

    const me = await agent.get(`${API}/auth/me`).expect(200);
    expect(me.body.data.emailVerifiedAt).not.toBeNull();

    await request(server)
      .post(`${API}/auth/forgot-password`)
      .send({ email: payload.email })
      .expect(200);
    const resetToken = extractToken(queueSpy.mock.calls.at(-1)![0].text);

    await request(server)
      .post(`${API}/auth/reset-password`)
      .send({ token: resetToken, newPassword: "NewStr0ngPass1" })
      .expect(200);

    await request(server)
      .post(`${API}/auth/login`)
      .send({ email: payload.email, password: "NewStr0ngPass1" })
      .expect(200);

    await request(server)
      .post(`${API}/auth/login`)
      .send({ email: payload.email, password: payload.password })
      .expect(401);

    void registered;
  });

  it("does not allow deleting another user's session", async () => {
    const agentA = request.agent(server);
    await agentA.post(`${API}/auth/register`).send(buildPayload()).expect(201);
    const sessionsA = await agentA.get(`${API}/auth/sessions`).expect(200);
    const sessionId = sessionsA.body.data[0].id as string;

    const agentB = request.agent(server);
    await agentB.post(`${API}/auth/register`).send(buildPayload()).expect(201);
    await agentB
      .delete(`${API}/auth/sessions/${sessionId}`)
      .set("Origin", "http://localhost:3000")
      .expect(404);
  });
});
