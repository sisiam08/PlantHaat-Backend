import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import request from "supertest";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { AppConfigService } from "../src/config/app-config.service";
import { hashPassword } from "../src/common/utils/password";
import { AuthService } from "../src/modules/auth/auth.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { resetDatabase } from "./cleanup";
import { clearSettings, setSettings } from "./settings-test-helper";

const API = "/api/v1";
const PASSWORD = "Str0ngPass1";

function responseCookies(response: request.Response): string[] {
  const header: string | string[] | undefined = response.headers["set-cookie"];
  if (Array.isArray(header)) return header;
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

describe("Auth sessions (e2e)", () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let auth: AuthService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(AppConfigService), { swagger: false, helmet: false });
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    await clearSettings(app, prisma);
  });

  async function createUser(role: "CUSTOMER" | "SELLER" | "ADMIN", label: string) {
    return prisma.user.create({
      data: {
        email: `${label}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}@example.com`,
        name: label,
        passwordHash: await hashPassword(PASSWORD),
        role,
        emailVerifiedAt: new Date(),
      },
    });
  }

  async function login(email: string) {
    const response = await request(server)
      .post(`${API}/auth/login`)
      .set("User-Agent", "auth-sessions-e2e")
      .send({ email, password: PASSWORD })
      .expect(200);
    const access = extractCookie(response, "ph_at")!;
    const refresh = extractCookie(response, "ph_rt")!;
    expect(access).toBeTruthy();
    expect(refresh).toBeTruthy();
    return { response, access, refresh };
  }

  function refreshWith(token: string) {
    return request(server).post(`${API}/auth/refresh`).set("Cookie", `ph_rt=${token}`);
  }

  function meWith(access: string) {
    return request(server).get(`${API}/auth/me`).set("Cookie", `ph_at=${access}`);
  }

  async function latestSession(userId: string) {
    return prisma.refreshSession.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  it("uses customer, seller and admin sliding/absolute lifetimes", async () => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const cases = [
      { role: "CUSTOMER" as const, sliding: 30, absolute: 90 },
      { role: "SELLER" as const, sliding: 14, absolute: 60 },
      { role: "ADMIN" as const, sliding: 7, absolute: 30 },
    ];
    for (const entry of cases) {
      const user = await createUser(entry.role, entry.role.toLowerCase());
      await login(user.email);
      const session = await latestSession(user.id);
      expect(session.expiresAt.getTime()).toBeGreaterThan(now + (entry.sliding - 1) * day);
      expect(session.expiresAt.getTime()).toBeLessThan(now + (entry.sliding + 1) * day);
      expect(session.absoluteExpiresAt!.getTime()).toBeGreaterThan(
        now + (entry.absolute - 1) * day,
      );
      expect(session.absoluteExpiresAt!.getTime()).toBeLessThan(
        now + (entry.absolute + 1) * day,
      );
    }
  });

  it("slides on rotation but never extends the family's absolute cap", async () => {
    await setSettings(app, prisma, {
      "security.refresh.customer.days": 1,
      "security.refresh.customer.maxDays": 2,
    });
    const user = await createUser("CUSTOMER", "sliding");
    const { refresh } = await login(user.email);
    const first = await latestSession(user.id);
    const absolute = first.absoluteExpiresAt!.getTime();

    await refreshWith(refresh).expect(200);
    const second = await latestSession(user.id);
    expect(second.id).not.toBe(first.id);
    expect(second.familyId).toBe(first.familyId);
    expect(second.absoluteExpiresAt!.getTime()).toBe(absolute);
    expect(second.expiresAt.getTime()).toBeGreaterThan(first.expiresAt.getTime());
  });

  it("rejects a session past its absolute lifetime and revokes the family", async () => {
    const user = await createUser("CUSTOMER", "absolute");
    const { refresh } = await login(user.email);
    const session = await latestSession(user.id);
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { absoluteExpiresAt: new Date(Date.now() - 60_000) },
    });

    const response = await refreshWith(refresh).expect(401);
    expect(response.body.error.code).toBe("SESSION_EXPIRED");
    const after = await prisma.refreshSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(after.revokedReason).toBe("ABSOLUTE_EXPIRY");
  });

  it("lets two parallel refreshes with the same token both succeed", async () => {
    const user = await createUser("CUSTOMER", "parallel");
    const { refresh } = await login(user.email);

    const [a, b] = await Promise.all([refreshWith(refresh), refreshWith(refresh)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const cookiesA = extractCookie(a, "ph_rt");
    const cookiesB = extractCookie(b, "ph_rt");
    expect([cookiesA, cookiesB].filter(Boolean)).toHaveLength(1);

    await meWith(extractCookie(a, "ph_at")!).expect(200);
    await meWith(extractCookie(b, "ph_at")!).expect(200);
  });

  it("detects reuse only after the grace window and kills the whole family", async () => {
    const user = await createUser("CUSTOMER", "reuse");
    const { refresh } = await login(user.email);
    const rotated = await refreshWith(refresh).expect(200);
    const successor = extractCookie(rotated, "ph_rt")!;

    // Within grace: benign duplicate.
    const grace = await refreshWith(refresh).expect(200);
    expect(extractCookie(grace, "ph_rt")).toBeUndefined();

    // Outside grace: reuse revokes every token in the family.
    await prisma.refreshSession.updateMany({
      where: { rotatedAt: { not: null } },
      data: { rotatedAt: new Date(Date.now() - 5 * 60_000) },
    });
    const reused = await refreshWith(refresh).expect(401);
    expect(reused.body.error.code).toBe("REFRESH_TOKEN_REUSED");
    const after = await refreshWith(successor).expect(401);
    expect(after.body.error.code).toBe("SESSION_EXPIRED");
    expect(await latestSessionRevokedReason(user.id)).toBe("REUSE_DETECTED");
  });

  it("logout revokes only the current family", async () => {
    const user = await createUser("CUSTOMER", "logout");
    const first = await login(user.email);
    const second = await login(user.email);

    await request(server)
      .post(`${API}/auth/logout`)
      .set("Cookie", `ph_rt=${first.refresh}`)
      .expect(204);

    await refreshWith(first.refresh).expect(401);
    await refreshWith(second.refresh).expect(200);
  });

  it("password change revokes every session, including the current one", async () => {
    const user = await createUser("CUSTOMER", "password");
    const first = await login(user.email);
    const second = await login(user.email);

    await request(server)
      .post(`${API}/auth/change-password`)
      .set("Authorization", `Bearer ${first.access}`)
      .send({ currentPassword: PASSWORD, newPassword: "NewStr0ngPass1" })
      .expect(200);

    await refreshWith(first.refresh).expect(401);
    await refreshWith(second.refresh).expect(401);
    expect(
      await prisma.refreshSession.count({
        where: { userId: user.id, revokedReason: "PASSWORD_CHANGED" },
      }),
    ).toBe(2);
  });

  it("cleanup is idempotent and keeps live sessions", async () => {
    const user = await createUser("CUSTOMER", "cleanup");
    await login(user.email);
    const live = await latestSession(user.id);
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await prisma.refreshSession.createMany({
      data: [
        {
          userId: user.id,
          familyId: "expired-family",
          tokenHash: "hash-expired-cleanup",
          expiresAt: old,
          absoluteExpiresAt: old,
        },
        {
          userId: user.id,
          familyId: "revoked-family",
          tokenHash: "hash-revoked-cleanup",
          expiresAt: new Date(Date.now() + 60_000),
          absoluteExpiresAt: new Date(Date.now() + 60_000),
          revokedAt: old,
          revokedReason: "LOGOUT",
        },
      ],
    });

    await auth.cleanupExpired();
    await auth.cleanupExpired();
    const remaining = await prisma.refreshSession.findMany({ where: { userId: user.id } });
    expect(remaining.map((row) => row.id)).toEqual([live.id]);
  });

  async function latestSessionRevokedReason(userId: string) {
    const sessions = await prisma.refreshSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return sessions.find((session) => session.revokedReason)?.revokedReason;
  }
});
