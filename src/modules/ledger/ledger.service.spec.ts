import { jest } from "@jest/globals";

import type { PrismaService } from "../../prisma/prisma.service";
import { LedgerService } from "./ledger.service";

type PrismaMockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const mockFn = (): PrismaMockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

function createPrismaMock() {
  return {
    ledgerEntry: {
      create: mockFn(),
      findMany: mockFn(),
      count: mockFn(),
      aggregate: mockFn(),
    },
    $transaction: mockFn(),
  };
}

describe("LedgerService", () => {
  it("records an entry with defaults applied", async () => {
    const prisma = createPrismaMock();
    const service = new LedgerService(prisma as unknown as PrismaService);

    await service.record(prisma as unknown as PrismaService, {
      sellerProfileId: "seller-1",
      type: "PAYOUT",
      amount: {} as never,
      description: "Payout PO-1",
      shopOrderId: null,
      payoutId: "payout-1",
      createdById: "admin-1",
    });

    expect(prisma.ledgerEntry.create).toHaveBeenCalledTimes(1);
    const arg = prisma.ledgerEntry.create.mock.calls[0][0] as {
      data: { sellerProfileId: string; payoutId: string };
    };
    expect(arg.data.sellerProfileId).toBe("seller-1");
    expect(arg.data.payoutId).toBe("payout-1");
  });

  it("returns zero when there are no ledger entries", async () => {
    const prisma = createPrismaMock();
    prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amount: null } });
    const service = new LedgerService(prisma as unknown as PrismaService);

    const balance = await service.balance("seller-1");

    expect(`${balance}`).toBe("0");
  });

  it("sums the ledger for the balance", async () => {
    const prisma = createPrismaMock();
    prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amount: { toString: () => "42.50" } } });
    const service = new LedgerService(prisma as unknown as PrismaService);

    const balance = await service.balance("seller-1");

    expect(`${balance}`).toBe("42.50");
  });

  it("aggregates with the given seller and no extra filters", async () => {
    const prisma = createPrismaMock();
    prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { amount: null } });
    const service = new LedgerService(prisma as unknown as PrismaService);

    await service.balance("seller-9");

    expect(prisma.ledgerEntry.aggregate).toHaveBeenCalledWith({
      where: { sellerProfileId: "seller-9" },
      _sum: { amount: true },
    });
  });

  it("lists entries paginated (all types)", async () => {
    const prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(async (...args: unknown[]) => {
      const op = args[0] as unknown;
      if (typeof op === "function") {
        return (op as (tx: unknown) => unknown)(prisma);
      }
      return Promise.all(op as Promise<unknown>[]);
    });
    prisma.ledgerEntry.findMany.mockResolvedValue([{ id: "l-1" }]);
    prisma.ledgerEntry.count.mockResolvedValue(1);
    const service = new LedgerService(prisma as unknown as PrismaService);

    const result = (await service.list("seller-1", {
      page: 1,
      limit: 20,
    } as never)) as { data: unknown[]; meta: { total: number } };

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    const manyArg = prisma.ledgerEntry.findMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(manyArg.where.sellerProfileId).toBe("seller-1");
    expect(manyArg.where.type).toBeUndefined();
  });

  it("filters by entry type when given", async () => {
    const prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(async (...args: unknown[]) => {
      const op = args[0] as unknown;
      return typeof op === "function"
        ? (op as (tx: unknown) => unknown)(prisma)
        : Promise.all(op as Promise<unknown>[]);
    });
    prisma.ledgerEntry.findMany.mockResolvedValue([]);
    prisma.ledgerEntry.count.mockResolvedValue(0);
    const service = new LedgerService(prisma as unknown as PrismaService);

    await service.list("seller-1", { page: 1, limit: 20, type: "PAYOUT" } as never);

    const manyArg = prisma.ledgerEntry.findMany.mock.calls[0][0] as { where: { type: string } };
    expect(manyArg.where.type).toBe("PAYOUT");
  });
});
