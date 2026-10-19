import { jest } from "@jest/globals";

import { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { SettingsService } from "../settings/settings.service";
import { CodRiskService } from "./cod-risk.service";

type MockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockFn = (): MockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();
const dec = (value: number) => new Prisma.Decimal(value);

function createService() {
  const prisma = {
    phoneRiskProfile: {
      findUnique: mockFn(),
      findMany: mockFn(),
      upsert: mockFn(),
      update: mockFn(),
    },
  };
  const settings = {
    getNumber: mockFn(),
  };
  (settings.getNumber as unknown as { mockImplementation: (fn: (key: string) => Promise<number>) => void }).mockImplementation(async (key) => {
      const values: Record<string, number> = {
        "codRisk.watchAfter": 2,
        "codRisk.blockAfter": 4,
        "codRisk.windowDays": 90,
        "codRisk.restrictCap": 2000,
      };
    return values[key] ?? 0;
  });
  const settingsService = settings as unknown as SettingsService;
  const notifications = { createForAdmins: mockFn() } as unknown as NotificationsService;
  const audit = { record: mockFn() } as unknown as AuditService;
  return new CodRiskService(
    prisma as unknown as PrismaService,
    settingsService,
    notifications,
    audit,
  );
}

describe("CodRiskService", () => {
  it("normalizes phone numbers and fingerprints addresses deterministically", () => {
    const service = createService();
    expect(service.normalize("+880 1712-345678")).toBe("+8801712345678");
    expect(service.normalize("bad")).toBeNull();
    const first = service.fingerprint({ districtId: 18, area: "Mir Pur", addressLine: "House 1" });
    const second = service.fingerprint({ districtId: 18, area: "mir pur", addressLine: "house  1" });
    expect(first).toBe(second);
  });

  it("moves OK -> WATCH on the second failure and notifies admins", async () => {
    const service = createService();
    const prisma = (service as unknown as { prisma: { phoneRiskProfile: Record<string, MockFn> } })
      .prisma;
    prisma.phoneRiskProfile.findUnique.mockResolvedValue({
      status: "OK",
      failedCount: 1,
      lastEventAt: new Date(),
      isWhitelisted: false,
    });

    await service.recordFailure("+8801712345678", "fp");

    expect(prisma.phoneRiskProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ failedCount: 2, status: "WATCH" }),
      }),
    );
    expect(
      (service as unknown as { notifications: { createForAdmins: MockFn } }).notifications
        .createForAdmins,
    ).toHaveBeenCalled();
  });

  it("moves to BLOCKED at the fourth failure", async () => {
    const service = createService();
    const prisma = (service as unknown as { prisma: { phoneRiskProfile: Record<string, MockFn> } })
      .prisma;
    prisma.phoneRiskProfile.findUnique.mockResolvedValue({
      status: "WATCH",
      failedCount: 3,
      lastEventAt: new Date(),
      isWhitelisted: false,
    });

    await service.recordFailure("+8801712345678", "fp");

    expect(prisma.phoneRiskProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ failedCount: 4, status: "BLOCKED" }),
      }),
    );
  });

  it("keeps a whitelisted phone at OK", async () => {
    const service = createService();
    const prisma = (service as unknown as { prisma: { phoneRiskProfile: Record<string, MockFn> } })
      .prisma;
    prisma.phoneRiskProfile.findUnique.mockResolvedValue({
      status: "OK",
      failedCount: 5,
      lastEventAt: new Date(),
      isWhitelisted: true,
    });

    await service.recordFailure("+8801712345678", "fp");

    expect(prisma.phoneRiskProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ status: "OK" }) }),
    );
  });

  it("assesses blocked and restricted COD totals, and bypasses whitelisted phones", async () => {
    const service = createService();
    const prisma = (service as unknown as { prisma: { phoneRiskProfile: Record<string, MockFn> } })
      .prisma;

    prisma.phoneRiskProfile.findMany.mockResolvedValue([
      { phoneNormalized: "+8801712345678", status: "BLOCKED", isWhitelisted: false },
    ]);
    await expect(
      service.assess({
        shippingPhone: "+8801712345678",
        accountPhone: null,
        addressFingerprint: null,
        codTotal: dec(500),
      }),
    ).resolves.toEqual({ status: "BLOCKED", capExceeded: false });

    prisma.phoneRiskProfile.findMany.mockResolvedValue([
      { phoneNormalized: "+8801712345678", status: "RESTRICTED", isWhitelisted: false },
    ]);
    await expect(
      service.assess({
        shippingPhone: "+8801712345678",
        accountPhone: null,
        addressFingerprint: null,
        codTotal: dec(2001),
      }),
    ).resolves.toEqual({ status: "RESTRICTED", capExceeded: true });

    prisma.phoneRiskProfile.findMany.mockResolvedValue([
      { phoneNormalized: "+8801712345678", status: "BLOCKED", isWhitelisted: true },
    ]);
    await expect(
      service.assess({
        shippingPhone: "+8801712345678",
        accountPhone: null,
        addressFingerprint: null,
        codTotal: dec(9999),
      }),
    ).resolves.toEqual({ status: "OK", capExceeded: false });
  });
});
