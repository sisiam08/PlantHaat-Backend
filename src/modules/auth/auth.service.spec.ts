import { jest } from "@jest/globals";
import type { EventEmitter2 } from "@nestjs/event-emitter";
import type { JwtService } from "@nestjs/jwt";

import { ErrorCode } from "../../common/errors/error-codes";
import { sha256Hex } from "../../common/utils/crypto";
import { hashPassword } from "../../common/utils/password";
import type { AppConfigService } from "../../config/app-config.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { MailService } from "../mail/mail.service";
import { AuthService } from "./auth.service";

const config = {
  values: {
    REFRESH_TTL_DAYS: 30,
    JWT_ACCESS_TTL: 900,
    REFRESH_REUSE_GRACE_SECONDS: 10,
    APP_URL: "http://localhost:3000",
  },
  isProduction: false,
  isTest: true,
  isDevelopment: false,
} as unknown as AppConfigService;

const activeUser = {
  id: "u1",
  email: "a@b.com",
  name: "A",
  phone: null,
  avatarUrl: null,
  role: "CUSTOMER",
  status: "ACTIVE",
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  createdAt: new Date(),
  deletedAt: null,
};

type PrismaMockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const mockFn = (): PrismaMockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

function createPrismaMock() {
  return {
    user: {
      findFirst: mockFn(),
      findUnique: mockFn(),
      create: mockFn(),
      update: mockFn(),
    },
    refreshSession: {
      create: mockFn(),
      findUnique: mockFn(),
      findFirst: mockFn(),
      findMany: mockFn(),
      update: mockFn(),
      updateMany: mockFn(),
      deleteMany: mockFn(),
    },
    authToken: {
      create: mockFn(),
      findUnique: mockFn(),
      findFirst: mockFn(),
      update: mockFn(),
      deleteMany: mockFn(),
    },
    $transaction: mockFn(),
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>): AuthService {
  prisma.$transaction.mockImplementation(async (...args: unknown[]) => {
    const op = args[0] as unknown;
    if (typeof op === "function") return (op as (tx: unknown) => unknown)(prisma);
    return Promise.all(op as Promise<unknown>[]);
  });
  const jwt = {
    signAsync: jest.fn<() => Promise<string>>().mockResolvedValue("signed-access-token"),
  } as unknown as JwtService;
  const mail = { queue: jest.fn() } as unknown as MailService;
  const events = { emit: jest.fn() } as unknown as EventEmitter2;
  return new AuthService(prisma as unknown as PrismaService, config, jwt, mail, events);
}

describe("AuthService", () => {
  describe("register", () => {
    it("creates a customer, issues a verification token and returns tokens", async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null); // email available
      prisma.user.findFirst.mockResolvedValue(null); // phone available / not used
      prisma.$transaction.mockImplementation(async (op) => (op as (tx: unknown) => unknown)(prisma));
      prisma.user.create.mockResolvedValue({
        ...activeUser,
        id: "u-new",
        email: "new@b.com",
      });
      prisma.authToken.create.mockResolvedValue({});
      prisma.refreshSession.create.mockResolvedValue({ id: "s1" });
      prisma.refreshSession.findMany.mockResolvedValue([]);
      const mail = { queue: jest.fn() } as unknown as MailService;

      const service = new AuthService(
        prisma as unknown as PrismaService,
        config,
        (() => {
          const jwt = {
            signAsync: jest.fn<() => Promise<string>>().mockResolvedValue("signed"),
          } as unknown as JwtService;
          return jwt;
        })(),
        mail,
        { emit: jest.fn() } as unknown as EventEmitter2,
      );

      const result = await service.register(
        { email: "New@B.com", password: "Str0ngPass1", name: " New " } as never,
        {},
      );

      expect(result.tokens.accessToken).toBe("signed");
      const created = prisma.user.create.mock.calls[0][0] as {
        data: { email: string; name: string; role: string };
      };
      expect(created.data.email).toBe("new@b.com");
      expect(created.data.name).toBe("New");
      expect(created.data.role).toBe("CUSTOMER");
      expect((mail.queue as unknown as jest.Mock).mock.calls.length).toBeGreaterThan(0);
      const tokenArg = prisma.authToken.create.mock.calls[0][0] as {
        data: { type: string; expiresAt: Date };
      };
      expect(tokenArg.data.type).toBe("EMAIL_VERIFICATION");
    });

    it("rejects a duplicate email with 409", async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue({ id: "exists" });
      prisma.$transaction.mockImplementation(async (op) => (op as (tx: unknown) => unknown)(prisma));
      const service = createService(prisma);

      await expect(
        service.register({ email: "a@b.com", password: "Str0ngPass1", name: "A" } as never, {}),
      ).rejects.toMatchObject({ code: ErrorCode.EMAIL_ALREADY_REGISTERED });
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("rejects a duplicate phone", async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue({ id: "phone-owner" });
      prisma.$transaction.mockImplementation(async (op) => (op as (tx: unknown) => unknown)(prisma));
      const service = createService(prisma);

      await expect(
        service.register(
          { email: "a@b.com", password: "Str0ngPass1", name: "A", phone: "01712345678" } as never,
          {},
        ),
      ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    });
  });

  describe("registerSeller", () => {
    it("creates a seller draft with a nested seller profile", async () => {
      const prisma = createPrismaMock();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (op) => (op as (tx: unknown) => unknown)(prisma));
      prisma.user.create.mockResolvedValue({
        ...activeUser,
        id: "u-new",
        role: "SELLER",
        email: "seller@b.com",
      });
      prisma.authToken.create.mockResolvedValue({});
      prisma.refreshSession.create.mockResolvedValue({ id: "s2" });
      const service = createService(prisma);

      const result = await service.registerSeller(
        {
          email: "Seller@B.com",
          password: "Str0ngPass1",
          name: "Seller",
          businessName: "My Nursery",
          contactPhone: "01798765432",
          phone: "01712345678",
          businessAddress: " Road 2 ",
        } as never,
        {},
      );

      expect(result.user.role).toBe("SELLER");
      const created = prisma.user.create.mock.calls[0][0] as {
        data: { role: string; sellerProfile: { create: Record<string, unknown> } };
      };
      expect(created.data.role).toBe("SELLER");
      expect(created.data.sellerProfile.create.businessName).toBe("My Nursery");
      expect(created.data.sellerProfile.create.sellerType).toBe("NURSERY");
    });
  });

  describe("login (extra guards)", () => {
    it("rejects an unknown email", async () => {
      const prisma = createPrismaMock();
      prisma.user.findFirst.mockResolvedValue(null);
      const service = createService(prisma);

      await expect(
        service.login({ email: "ghost@b.com", password: "Whatever1" } as never, {}),
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });
    });

    it("rejects a suspended account after correct credentials", async () => {
      const prisma = createPrismaMock();
      const passwordHash = await hashPassword("CorrectPass1");
      prisma.user.findFirst.mockResolvedValue({
        ...activeUser,
        status: "SUSPENDED",
        passwordHash,
      });
      const service = createService(prisma);

      await expect(
        service.login({ email: "a@b.com", password: "CorrectPass1" } as never, {}),
      ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_SUSPENDED });
    });

    it("locks exactly at the threshold without an early lock", async () => {
      const prisma = createPrismaMock();
      const passwordHash = await hashPassword("CorrectPass1");
      prisma.user.findFirst.mockResolvedValue({
        ...activeUser,
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
      });
      prisma.user.update.mockResolvedValue({});
      const service = createService(prisma);

      await expect(
        service.login({ email: "a@b.com", password: "Wrong1" } as never, {}),
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });
      const updateArg = prisma.user.update.mock.calls[0][0] as {
        data: { failedLoginCount: number; lockedUntil?: Date | null };
      };
      expect(updateArg.data.failedLoginCount).toBe(1);
      expect(updateArg.data.lockedUntil).toBeUndefined();
    });
  });
  describe("login", () => {
    it("locks the account on the 5th consecutive failed attempt", async () => {
      const prisma = createPrismaMock();
      const passwordHash = await hashPassword("CorrectPass1");
      prisma.user.findFirst.mockResolvedValue({
        ...activeUser,
        passwordHash,
        failedLoginCount: 4,
        lockedUntil: null,
      });
      prisma.user.update.mockResolvedValue({});
      const service = createService(prisma);

      await expect(
        service.login({ email: "a@b.com", password: "WrongPass1" }, {}),
      ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_LOCKED });

      const updateArg = prisma.user.update.mock.calls[0][0] as {
        data: { failedLoginCount: number; lockedUntil?: Date };
      };
      expect(updateArg.data.failedLoginCount).toBe(5);
      expect(updateArg.data.lockedUntil).toBeInstanceOf(Date);
    });

    it("rejects login while the account is locked", async () => {
      const prisma = createPrismaMock();
      prisma.user.findFirst.mockResolvedValue({
        ...activeUser,
        passwordHash: "hash",
        failedLoginCount: 5,
        lockedUntil: new Date(Date.now() + 60_000),
      });
      const service = createService(prisma);

      await expect(
        service.login({ email: "a@b.com", password: "CorrectPass1" }, {}),
      ).rejects.toMatchObject({ code: ErrorCode.ACCOUNT_LOCKED });
    });

    it("resets the failure counter and issues tokens on success", async () => {
      const prisma = createPrismaMock();
      const passwordHash = await hashPassword("CorrectPass1");
      prisma.user.findFirst.mockResolvedValue({
        ...activeUser,
        passwordHash,
        failedLoginCount: 2,
        lockedUntil: null,
      });
      prisma.user.update.mockResolvedValue({});
      prisma.refreshSession.findMany.mockResolvedValue([]);
      prisma.refreshSession.create.mockResolvedValue({ id: "s1" });
      const service = createService(prisma);

      const result = await service.login({ email: "a@b.com", password: "CorrectPass1" }, {});

      expect(result.tokens.accessToken).toBe("signed-access-token");
      expect(result.tokens.refreshToken).toContain("s1.");
      const resetArg = prisma.user.update.mock.calls[0][0] as {
        data: { failedLoginCount: number; lockedUntil: null };
      };
      expect(resetArg.data.failedLoginCount).toBe(0);
      expect(resetArg.data.lockedUntil).toBeNull();
    });
  });

  describe("refresh", () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    it("revokes the family when the secret does not match", async () => {
      const prisma = createPrismaMock();
      prisma.refreshSession.findUnique.mockResolvedValue({
        id: "s1",
        familyId: "f1",
        tokenHash: sha256Hex("different-secret"),
        expiresAt: future,
        rotatedAt: null,
        revokedAt: null,
        user: activeUser,
      });
      prisma.refreshSession.updateMany.mockResolvedValue({ count: 1 });
      const service = createService(prisma);

      await expect(service.refresh("s1.actual-secret", {})).rejects.toMatchObject({
        code: ErrorCode.INVALID_REFRESH_TOKEN,
      });
      expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: "f1", revokedAt: null },
          data: expect.objectContaining({ revokedReason: "TOKEN_MISMATCH" }),
        }),
      );
    });

    it("rejects a revoked session", async () => {
      const prisma = createPrismaMock();
      prisma.refreshSession.findUnique.mockResolvedValue({
        id: "s1",
        familyId: "f1",
        tokenHash: sha256Hex("secret"),
        expiresAt: future,
        rotatedAt: new Date(),
        revokedAt: new Date(),
        user: activeUser,
      });
      const service = createService(prisma);

      await expect(service.refresh("s1.secret", {})).rejects.toMatchObject({
        code: ErrorCode.SESSION_EXPIRED,
      });
    });

    it("rotates the token when it has not been rotated yet", async () => {
      const prisma = createPrismaMock();
      prisma.refreshSession.findUnique.mockResolvedValue({
        id: "s1",
        familyId: "f1",
        tokenHash: sha256Hex("secret"),
        expiresAt: future,
        rotatedAt: null,
        revokedAt: null,
        user: activeUser,
      });
      prisma.refreshSession.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshSession.create.mockResolvedValue({ id: "s2" });
      prisma.refreshSession.update.mockResolvedValue({});
      const service = createService(prisma);

      const result = await service.refresh("s1.secret", {});

      expect(result.accessToken).toBe("signed-access-token");
      expect(result.refreshToken).toContain("s2.");
      expect(prisma.refreshSession.create).toHaveBeenCalled();
    });

    it("returns an access token only within the grace window", async () => {
      const prisma = createPrismaMock();
      prisma.refreshSession.findUnique
        .mockResolvedValueOnce({
          id: "s1",
          familyId: "f1",
          tokenHash: sha256Hex("secret"),
          expiresAt: future,
          rotatedAt: null,
          revokedAt: null,
          user: activeUser,
        })
        .mockResolvedValueOnce({
          revokedAt: null,
          rotatedAt: new Date(),
          replacedById: "s2",
        });
      prisma.refreshSession.updateMany.mockResolvedValue({ count: 0 });
      const service = createService(prisma);

      const result = await service.refresh("s1.secret", {});

      expect(result.accessToken).toBe("signed-access-token");
      expect(result.refreshToken).toBeUndefined();
      expect(prisma.refreshSession.create).not.toHaveBeenCalled();
    });

    it("detects reuse outside the grace window and revokes the family", async () => {
      const prisma = createPrismaMock();
      prisma.refreshSession.findUnique
        .mockResolvedValueOnce({
          id: "s1",
          familyId: "f1",
          tokenHash: sha256Hex("secret"),
          expiresAt: future,
          rotatedAt: null,
          revokedAt: null,
          user: activeUser,
        })
        .mockResolvedValueOnce({
          revokedAt: null,
          rotatedAt: new Date(Date.now() - 60_000),
          replacedById: null,
        });
      prisma.refreshSession.updateMany.mockResolvedValue({ count: 0 });
      const service = createService(prisma);

      await expect(service.refresh("s1.secret", {})).rejects.toMatchObject({
        code: ErrorCode.REFRESH_TOKEN_REUSED,
      });
      expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: "f1", revokedAt: null },
          data: expect.objectContaining({ revokedReason: "REUSE_DETECTED" }),
        }),
      );
    });
  });

  describe("logout & sessions", () => {
    it("silently accepts a missing refresh token at logout", async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await expect(service.logout(undefined)).resolves.toBeUndefined();
      expect(prisma.refreshSession.findUnique).not.toHaveBeenCalled();
    });

    it("revokes the family and emits on logout", async () => {
      const prisma = createPrismaMock();
      const events = { emit: jest.fn() } as unknown as EventEmitter2;
      prisma.refreshSession.findUnique.mockResolvedValue({ familyId: "f1", userId: "u1" });
      prisma.refreshSession.updateMany.mockResolvedValue({ count: 1 });
      const jwt = {
        signAsync: jest.fn<() => Promise<string>>().mockResolvedValue("signed"),
      } as unknown as JwtService;
      const service = new AuthService(
        prisma as unknown as PrismaService,
        config,
        jwt,
        { queue: jest.fn() } as unknown as MailService,
        events,
      );

      await service.logout("s1.secret");

      expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: "f1", revokedAt: null },
          data: expect.objectContaining({ revokedReason: "LOGOUT" }),
        }),
      );
      expect(events.emit).toHaveBeenCalledWith(
        "auth.session_revoked",
        expect.objectContaining({ userId: "u1" }),
      );
    });

    it("revokes all sessions on logoutAll", async () => {
      const prisma = createPrismaMock();
      const service = createService(prisma);

      await service.logoutAll("u1");

      expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "u1", revokedAt: null },
          data: expect.objectContaining({ revokedReason: "LOGOUT_ALL" }),
        }),
      );
    });

    it("lists active sessions with an isCurrent flag", async () => {
      const prisma = createPrismaMock();
      prisma.refreshSession.findMany.mockResolvedValue([
        { id: "s1", userAgent: null, ipAddress: null, lastUsedAt: new Date(), createdAt: new Date() },
      ]);
      const service = createService(prisma);

      const sessions = await service.listSessions("u1", "s1");

      expect(sessions).toHaveLength(1);
      expect(sessions[0].isCurrent).toBe(true);
    });

    it("rejects revoking another user's session", async () => {
      const prisma = createPrismaMock();
      prisma.refreshSession.findFirst.mockResolvedValue(null);
      const service = createService(prisma);

      await expect(service.revokeSessionForUser("u1", "s-foreign")).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });

    it("revokes own session with the right reason", async () => {
      const prisma = createPrismaMock();
      prisma.refreshSession.findFirst.mockResolvedValue({ id: "s1" });
      const service = createService(prisma);

      await service.revokeSessionForUser("u1", "s1");

      expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "s1", revokedAt: null },
          data: expect.objectContaining({ revokedReason: "REVOKED_BY_USER" }),
        }),
      );
    });
  });

  describe("email verification & passwords", () => {
    it("verifies the email with a valid token", async () => {
      const prisma = createPrismaMock();
      prisma.$transaction.mockImplementation(async (op) => Promise.all(op as Promise<unknown>[]));
      prisma.authToken.findUnique.mockResolvedValue({
        id: "t1",
        userId: "u1",
        type: "EMAIL_VERIFICATION",
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const service = createService(prisma);

      await expect(service.verifyEmail("valid-token")).resolves.toEqual({ verified: true });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "u1" },
          data: expect.objectContaining({ emailVerifiedAt: expect.anything() }),
        }),
      );
    });

    it("rejects an invalid verification token", async () => {
      const prisma = createPrismaMock();
      prisma.authToken.findUnique.mockResolvedValue(null);
      const service = createService(prisma);

      await expect(service.verifyEmail("bad")).rejects.toMatchObject({
        code: ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      });
    });

    it("rejects a used verification token", async () => {
      const prisma = createPrismaMock();
      prisma.authToken.findUnique.mockResolvedValue({
        id: "t1",
        userId: "u1",
        type: "EMAIL_VERIFICATION",
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      const service = createService(prisma);

      await expect(service.verifyEmail("used")).rejects.toMatchObject({
        code: ErrorCode.INVALID_OR_EXPIRED_TOKEN,
      });
    });

    it("reports alreadyVerified without sending", async () => {
      const prisma = createPrismaMock();
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        name: "A",
        emailVerifiedAt: new Date(),
      });
      const mail = { queue: jest.fn() } as unknown as MailService;
      const jwt = {
        signAsync: jest.fn<() => Promise<string>>().mockResolvedValue("signed"),
      } as unknown as JwtService;
      const service = new AuthService(
        prisma as unknown as PrismaService,
        config,
        jwt,
        mail,
        { emit: jest.fn() } as unknown as EventEmitter2,
      );

      await expect(service.resendVerification("u1")).resolves.toEqual({
        sent: false,
        alreadyVerified: true,
      });
      expect(prisma.authToken.create).not.toHaveBeenCalled();
    });

    it("sends a new verification token when not verified", async () => {
      const prisma = createPrismaMock();
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        name: "A",
        emailVerifiedAt: null,
      });
      prisma.authToken.findFirst.mockResolvedValue(null);
      prisma.authToken.create.mockResolvedValue({});
      const mail = { queue: jest.fn() } as unknown as MailService;
      const service = new AuthService(
        prisma as unknown as PrismaService,
        config,
        (() => {
          const jwt = {
            signAsync: jest.fn<() => Promise<string>>().mockResolvedValue("signed"),
          } as unknown as JwtService;
          return jwt;
        })(),
        mail,
        { emit: jest.fn() } as unknown as EventEmitter2,
      );

      await expect(service.resendVerification("u1")).resolves.toEqual({
        sent: true,
        alreadyVerified: false,
      });
      expect((mail.queue as unknown as jest.Mock).mock.calls.length).toBe(1);
    });

    it("rate-limits resend inside the cooldown", async () => {
      const prisma = createPrismaMock();
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        name: "A",
        emailVerifiedAt: null,
      });
      prisma.authToken.findFirst.mockResolvedValue({ createdAt: new Date() });
      const service = createService(prisma);

      await expect(service.resendVerification("u1")).rejects.toMatchObject({
        code: ErrorCode.TOO_MANY_REQUESTS,
      });
    });

    it("always reports sent for forgotten passwords but only emails active users", async () => {
      const prisma = createPrismaMock();
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        name: "A",
        status: "SUSPENDED",
      });
      const mail = { queue: jest.fn() } as unknown as MailService;
      const service = new AuthService(
        prisma as unknown as PrismaService,
        config,
        (() => {
          const jwt = {
            signAsync: jest.fn<() => Promise<string>>().mockResolvedValue("signed"),
          } as unknown as JwtService;
          return jwt;
        })(),
        mail,
        { emit: jest.fn() } as unknown as EventEmitter2,
      );

      await expect(service.forgotPassword("A@B.Com")).resolves.toEqual({ sent: true });
      expect(prisma.authToken.create).not.toHaveBeenCalled();
      expect((mail.queue as unknown as jest.Mock).mock.calls.length).toBe(0);
    });

    it("emails a reset token for active users", async () => {
      const prisma = createPrismaMock();
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        email: "a@b.com",
        name: "A",
        status: "ACTIVE",
      });
      prisma.authToken.create.mockResolvedValue({});
      const mail = { queue: jest.fn() } as unknown as MailService;
      const service = new AuthService(
        prisma as unknown as PrismaService,
        config,
        (() => {
          const jwt = {
            signAsync: jest.fn<() => Promise<string>>().mockResolvedValue("signed"),
          } as unknown as JwtService;
          return jwt;
        })(),
        mail,
        { emit: jest.fn() } as unknown as EventEmitter2,
      );

      await expect(service.forgotPassword("a@b.com")).resolves.toEqual({ sent: true });
      const tokenArg = prisma.authToken.create.mock.calls[0][0] as {
        data: { type: string };
      };
      expect(tokenArg.data.type).toBe("PASSWORD_RESET");
      expect((mail.queue as unknown as jest.Mock).mock.calls.length).toBe(1);
    });

    it("resets the password and revokes all sessions", async () => {
      const prisma = createPrismaMock();
      prisma.$transaction.mockImplementation(async (op) => Promise.all(op as Promise<unknown>[]));
      prisma.authToken.findUnique.mockResolvedValue({
        id: "t1",
        userId: "u1",
        type: "PASSWORD_RESET",
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      const service = createService(prisma);

      await expect(service.resetPassword("tok", "NewPass1")).resolves.toEqual({ reset: true });
      const sessionArg = prisma.refreshSession.updateMany.mock.calls[0][0] as {
        data: { revokedReason: string };
      };
      expect(sessionArg.data.revokedReason).toBe("PASSWORD_RESET");
    });

    it("changes the password when the current one verifies", async () => {
      const prisma = createPrismaMock();
      prisma.$transaction.mockImplementation(async (op) => Promise.all(op as Promise<unknown>[]));
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        passwordHash: await hashPassword("OldPass1"),
      });
      const service = createService(prisma);

      await expect(
        service.changePassword("u1", "s-current", {
          currentPassword: "OldPass1",
          newPassword: "NewPass1",
        } as never),
      ).resolves.toEqual({ changed: true });
      const sessionArg = prisma.refreshSession.updateMany.mock.calls[0][0] as {
        where: { id: { not: string } };
      };
      expect(sessionArg.where.id.not).toBe("s-current");
    });

    it("rejects a wrong current password", async () => {
      const prisma = createPrismaMock();
      prisma.user.findFirst.mockResolvedValue({
        id: "u1",
        passwordHash: await hashPassword("OldPass1"),
      });
      const service = createService(prisma);

      await expect(
        service.changePassword("u1", "s-current", {
          currentPassword: "NopePass1",
          newPassword: "NewPass1",
        } as never),
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_CREDENTIALS });
    });

    it("rejects a missing user when changing password", async () => {
      const prisma = createPrismaMock();
      prisma.user.findFirst.mockResolvedValue(null);
      const service = createService(prisma);

      await expect(
        service.changePassword("u9", "s-current", {
          currentPassword: "OldPass1",
          newPassword: "NewPass1",
        } as never),
      ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    });
  });
});
