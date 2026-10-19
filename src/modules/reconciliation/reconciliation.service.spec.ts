import { jest } from "@jest/globals";

import { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import { ReconciliationService } from "./reconciliation.service";

type MockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockFn = (): MockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

function createPrismaMock() {
  return {
    order: { findMany: mockFn() },
    shopOrder: { findMany: mockFn(), findMany2: mockFn() },
    ledgerEntry: { groupBy: mockFn() },
    payout: { groupBy: mockFn() },
    refund: { groupBy: mockFn() },
  };
}

describe("ReconciliationService", () => {
  it("reports no violations for consistent data", async () => {
    const prisma = createPrismaMock();
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", orderNumber: "O-1", grandTotal: new Prisma.Decimal(160), shopOrders: [{ id: "so1", total: new Prisma.Decimal(160) }] },
    ]);
    prisma.shopOrder.findMany.mockResolvedValue([
      {
        id: "so1",
        shopOrderNumber: "SO-1",
        status: "DELIVERED",
        total: new Prisma.Decimal(160),
        commissionAmount: new Prisma.Decimal(10),
        sellerNetAmount: new Prisma.Decimal(150),
        deliveredAt: new Date(),
        order: { paymentMethod: "COD" },
        ledgerEntries: [{ type: "COD_COMMISSION_DUE", amount: new Prisma.Decimal(-10) }],
      },
    ]);
    prisma.payout.groupBy.mockResolvedValue([]);
    prisma.ledgerEntry.groupBy.mockResolvedValue([]);
    prisma.refund.groupBy.mockResolvedValue([]);

    const result = await new ReconciliationService(prisma as unknown as PrismaService).run({});
    expect(result.violations).toEqual([]);
    expect(result.checked).toBeGreaterThan(0);
  });

  it("reports total, split, ledger and refund violations", async () => {
    const prisma = createPrismaMock();
    prisma.order.findMany.mockResolvedValue([
      { id: "o1", orderNumber: "O-1", grandTotal: new Prisma.Decimal(100), shopOrders: [{ id: "so1", total: new Prisma.Decimal(90) }] },
    ]);
    prisma.shopOrder.findMany.mockResolvedValue([
      {
        id: "so1",
        shopOrderNumber: "SO-1",
        status: "DELIVERED",
        total: new Prisma.Decimal(90),
        commissionAmount: new Prisma.Decimal(10),
        sellerNetAmount: new Prisma.Decimal(70),
        deliveredAt: new Date(),
        order: { paymentMethod: "COD" },
        ledgerEntries: [],
      },
    ]);
    prisma.payout.groupBy.mockResolvedValue([
      { sellerProfileId: "s1", _sum: { amount: new Prisma.Decimal(50) } },
    ]);
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { sellerProfileId: "s1", _sum: { amount: new Prisma.Decimal(10) } },
    ]);
    prisma.refund.groupBy.mockResolvedValue([
      { shopOrderId: "so1", _sum: { amount: new Prisma.Decimal(200) } },
    ]);

    const result = await new ReconciliationService(prisma as unknown as PrismaService).run({});
    const codes = result.violations.map((violation) => violation.code);
    expect(codes).toContain("ORDER_TOTAL_MISMATCH");
    expect(codes).toContain("SHOP_TOTAL_SPLIT_MISMATCH");
    expect(codes).toContain("LEDGER_MISSING");
    expect(codes).toContain("PAYOUT_EXCEEDS_CREDITS");
    expect(codes).toContain("REFUND_EXCEEDS_PAID");
  });
});
