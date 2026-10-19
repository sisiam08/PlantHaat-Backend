import { jest } from "@jest/globals";

import { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import type { SettingsService } from "../settings/settings.service";
import { LedgerService } from "./ledger.service";

type MockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockFn = (): MockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

function createPrismaMock() {
  return {
    ledgerEntry: { create: mockFn(), findMany: mockFn(), count: mockFn() },
    shopOrder: { findUnique: mockFn() },
    complaint: { findMany: mockFn() },
    $transaction: mockFn(),
  };
}

function settings(holdHours = 48) {
  return { getNumber: jest.fn(async () => holdHours) } as unknown as SettingsService;
}

const HOUR = 60 * 60 * 1000;

describe("LedgerService", () => {
  it("leaves negative entries immediately available", async () => {
    const prisma = createPrismaMock();
    const service = new LedgerService(prisma as unknown as PrismaService, settings());
    await service.record(prisma as unknown as PrismaService, {
      sellerProfileId: "s1",
      type: "COD_COMMISSION_DUE",
      amount: new Prisma.Decimal(-30),
    });
    const data = (prisma.ledgerEntry.create.mock.calls[0][0] as { data: { availableAt: Date | null } })
      .data;
    expect(data.availableAt).toBeNull();
  });

  it("unlocks positive earnings at deliveredAt + holdHours", async () => {
    const prisma = createPrismaMock();
    const deliveredAt = new Date("2026-10-01T00:00:00Z");
    prisma.shopOrder.findUnique.mockResolvedValue({ deliveredAt });
    const service = new LedgerService(prisma as unknown as PrismaService, settings(48));
    await service.record(prisma as unknown as PrismaService, {
      sellerProfileId: "s1",
      shopOrderId: "so1",
      type: "ORDER_EARNING",
      amount: new Prisma.Decimal(100),
    });
    const data = (prisma.ledgerEntry.create.mock.calls[0][0] as { data: { availableAt: Date } }).data;
    expect(data.availableAt.toISOString()).toBe(
      new Date(deliveredAt.getTime() + 48 * HOUR).toISOString(),
    );
  });

  it("uses creation time for positive credits without a delivery", async () => {
    const prisma = createPrismaMock();
    const before = Date.now();
    const service = new LedgerService(prisma as unknown as PrismaService, settings(48));
    await service.record(prisma as unknown as PrismaService, {
      sellerProfileId: "s1",
      type: "ADJUSTMENT",
      amount: new Prisma.Decimal(10),
    });
    const data = (prisma.ledgerEntry.create.mock.calls[0][0] as { data: { availableAt: Date } }).data;
    expect(data.availableAt.getTime()).toBeGreaterThanOrEqual(before + 48 * HOUR);
  });

  it("splits pending/available/owed/net and holds entries under open complaints", async () => {
    const prisma = createPrismaMock();
    const past = new Date(Date.now() - HOUR);
    const future = new Date(Date.now() + HOUR);
    prisma.ledgerEntry.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal(100), availableAt: past, shopOrderId: "so-held" },
      { amount: new Prisma.Decimal(50), availableAt: future, shopOrderId: "so-future" },
      { amount: new Prisma.Decimal(-30), availableAt: null, shopOrderId: "so-held" },
    ]);
    prisma.complaint.findMany.mockResolvedValue([{ shopOrderId: "so-held" }]);
    const service = new LedgerService(prisma as unknown as PrismaService, settings());

    const balance = await service.balances("s1");
    expect(balance.pending.toFixed(2)).toBe("150.00");
    expect(balance.available.toFixed(2)).toBe("-30.00");
    expect(balance.owedToPlatform.toFixed(2)).toBe("30.00");
    expect(balance.net.toFixed(2)).toBe("120.00");
  });

  it("releases held entries once the complaint is resolved", async () => {
    const prisma = createPrismaMock();
    prisma.ledgerEntry.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal(100), availableAt: new Date(Date.now() - HOUR), shopOrderId: "so1" },
      { amount: new Prisma.Decimal(-30), availableAt: null, shopOrderId: "so1" },
    ]);
    prisma.complaint.findMany.mockResolvedValue([]);
    const service = new LedgerService(prisma as unknown as PrismaService, settings());

    const balance = await service.balances("s1");
    expect(balance.pending.toFixed(2)).toBe("0.00");
    expect(balance.available.toFixed(2)).toBe("70.00");
    expect(balance.net.toFixed(2)).toBe("70.00");
  });

  it("keeps the legacy balance() as the net total", async () => {
    const prisma = createPrismaMock();
    prisma.ledgerEntry.findMany.mockResolvedValue([
      { amount: new Prisma.Decimal(10), availableAt: null, shopOrderId: null },
    ]);
    const service = new LedgerService(prisma as unknown as PrismaService, settings());
    expect((await service.balance("s1")).toFixed(2)).toBe("10.00");
  });
});
