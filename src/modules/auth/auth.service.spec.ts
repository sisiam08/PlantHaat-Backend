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
      findMany: mockFn(),
      update: mockFn(),
      updateMany: mockFn(),
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
  const jwt = {
    signAsync: jest.fn<() => Promise<string>>().mockResolvedValue("signed-access-token"),
  } as unknown as JwtService;
  const mail = { queue: jest.fn() } as unknown as MailService;
  const events = { emit: jest.fn() } as unknown as EventEmitter2;
  return new AuthService(prisma as unknown as PrismaService, config, jwt, mail, events);
}

describe("AuthService", () => {
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
});
