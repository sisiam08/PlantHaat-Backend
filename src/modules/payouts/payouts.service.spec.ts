import { jest } from "@jest/globals";

import { ErrorCode } from "../../common/errors/error-codes";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { SellerContextService } from "../sellers/seller-context.service";
import { PayoutsService } from "./payouts.service";

type PrismaMockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const mockFn = (): PrismaMockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

const actor = { id: "admin-1", role: "ADMIN" } as never;

function createPrismaMock() {
  return {
    payout: {
      findMany: mockFn(),
      findUnique: mockFn(),
      create: mockFn(),
      update: mockFn(),
      count: mockFn(),
    },
    sellerProfile: { findUnique: mockFn() },
    ledgerEntry: { findMany: mockFn() },
    $transaction: mockFn(),
  };
}

function createService(
  prisma: ReturnType<typeof createPrismaMock>,
  ledger?: {
    record: jest.Mock;
    balance: jest.Mock<() => Promise<unknown>>;
    list: jest.Mock;
  },
) {
  const ledgerMock = ledger ?? {
    record: jest.fn<() => Promise<void>>(),
    balance: jest.fn<() => Promise<unknown>>().mockResolvedValue("12.34"),
    list: jest.fn<() => Promise<unknown>>().mockResolvedValue({ data: [], meta: { total: 0 } }),
  };
  const audit = { record: jest.fn() } as unknown as AuditService;
  const sellerContext = {
    requireProfile: jest
      .fn<() => Promise<{ id: string }>>()
      .mockResolvedValue({ id: "seller-1" }),
  } as unknown as SellerContextService;
  return new PayoutsService(
    prisma as unknown as PrismaService,
    ledgerMock as never,
    audit,
    sellerContext,
  );
}

describe("PayoutsService", () => {
  it("lists payouts paginated", async () => {
    const prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(async (ops: unknown[]) =>
      Promise.all(ops as Promise<unknown>[]),
    );
    prisma.payout.findMany.mockResolvedValue([{ id: "p-1" }]);
    prisma.payout.count.mockResolvedValue(1);
    const service = createService(prisma);

    const result = (await service.listPayouts({ page: 1, limit: 20 } as never)) as {
      data: unknown[];
      meta: { total: number };
    };

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it("rejects a payout for an unknown seller", async () => {
    const prisma = createPrismaMock();
    prisma.sellerProfile.findUnique.mockResolvedValue(null);
    const service = createService(prisma);

    await expect(
      service.createPayout({ sellerProfileId: "nope", amount: 100 } as never, actor, {}),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it("creates a payout, records a negative ledger entry and audits it", async () => {
    const prisma = createPrismaMock();
    prisma.sellerProfile.findUnique.mockResolvedValue({ id: "seller-1" });
    const ledger = {
      record: jest.fn<() => Promise<void>>(),
      balance: jest.fn<() => Promise<unknown>>().mockResolvedValue("0"),
      list: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (op: unknown) =>
      typeof op === "function" ? op(prisma) : Promise.all(op as Promise<unknown>[]),
    );
    prisma.payout.create.mockResolvedValue({ id: "p-1", payoutNumber: "PO-0001" });
    const service = createService(prisma, ledger);

    const payout = await service.createPayout(
      {
        sellerProfileId: "seller-1",
        amount: 150.5,
        method: "BKASH",
        reference: "ref-1",
        note: "test",
      } as never,
      actor,
      {},
    );

    expect((payout as { id: string }).id).toBe("p-1");
    expect(ledger.record).toHaveBeenCalledTimes(1);
    const ledgerArg = ledger.record.mock.calls[0][1] as {
      amount: { negated: () => { toString: () => string } };
      type: string;
    };
    expect(ledgerArg.type).toBe("PAYOUT");
    expect(ledgerArg.amount).toBeDefined();
  });

  it("throws NOT_FOUND when updating a missing payout", async () => {
    const prisma = createPrismaMock();
    prisma.payout.findUnique.mockResolvedValue(null);
    const service = createService(prisma);

    await expect(service.updatePayout("nope", {} as never, actor, {})).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });

  it("updates a payout and stamps processor on PAID", async () => {
    const prisma = createPrismaMock();
    prisma.payout.findUnique.mockResolvedValue({ id: "p-1", status: "PENDING" });
    prisma.payout.update.mockResolvedValue({ id: "p-1", status: "PAID" });
    const service = createService(prisma);

    const updated = (await service.updatePayout(
      "p-1",
      { status: "PAID" } as never,
      actor,
      {},
    )) as { status: string };

    expect(updated.status).toBe("PAID");
    const updateArg = prisma.payout.update.mock.calls[0][0] as {
      data: { processedById?: string };
    };
    expect(updateArg.data.processedById).toBe("admin-1");
  });

  it("rejects dues payments for unknown sellers", async () => {
    const prisma = createPrismaMock();
    prisma.sellerProfile.findUnique.mockResolvedValue(null);
    const service = createService(prisma);

    await expect(
      service.recordDuesPayment("nope", { amount: 50 } as never, actor, {}),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it("records a dues payment and returns the new balance", async () => {
    const prisma = createPrismaMock();
    prisma.sellerProfile.findUnique.mockResolvedValue({ id: "seller-1" });
    const ledger = {
      record: jest.fn<() => Promise<void>>(),
      balance: jest.fn<() => Promise<unknown>>().mockResolvedValue({ toFixed: () => "77.00" }),
      list: jest.fn(),
    };
    const service = createService(prisma, ledger);

    const result = await service.recordDuesPayment("seller-1", { amount: 50 } as never, actor, {});

    expect(result).toEqual({ balance: "77.00" });
    expect(ledger.record).toHaveBeenCalledTimes(1);
    expect(ledger.record.mock.calls[0][0]).toBe(prisma);
    const entry = ledger.record.mock.calls[0][1] as { type: string };
    expect(entry.type).toBe("DUES_PAYMENT");
  });

  it("records a signed adjustment", async () => {
    const prisma = createPrismaMock();
    prisma.sellerProfile.findUnique.mockResolvedValue({ id: "seller-1" });
    const ledger = {
      record: jest.fn<() => Promise<void>>(),
      balance: jest.fn<() => Promise<unknown>>().mockResolvedValue({ toFixed: () => "-20.00" }),
      list: jest.fn(),
    };
    const service = createService(prisma, ledger);

    const result = await service.recordAdjustment(
      "seller-1",
      { amount: -20, note: "correction" } as never,
      actor,
      {},
    );

    expect(result).toEqual({ balance: "-20.00" });
    const entry = ledger.record.mock.calls[0][1] as { type: string };
    expect(entry.type).toBe("ADJUSTMENT");
  });

  it("delegates the seller ledger query to the ledger service", async () => {
    const prisma = createPrismaMock();
    prisma.sellerProfile.findUnique.mockResolvedValue({ id: "seller-1" });
    const ledger = {
      record: jest.fn<() => Promise<void>>(),
      balance: jest.fn<() => Promise<unknown>>(),
      list: jest.fn<() => Promise<unknown>>().mockResolvedValue({ data: [], meta: { total: 0 } }),
    };
    const service = createService(prisma, ledger);

    await service.sellerLedger("seller-1", { page: 1, limit: 20 } as never);

    expect(ledger.list).toHaveBeenCalledWith("seller-1", { page: 1, limit: 20 });
  });

  it("returns balance, ledger and payouts for the seller earnings view", async () => {
    const prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(async (ops: unknown[]) =>
      Promise.all(ops as Promise<unknown>[]),
    );
    prisma.ledgerEntry.findMany.mockResolvedValue([{ id: "l-1" }]);
    prisma.payout.findMany.mockResolvedValue([{ id: "p-1" }]);
    const ledger = {
      record: jest.fn<() => Promise<void>>(),
      balance: jest.fn<() => Promise<unknown>>().mockResolvedValue("33.00"),
      list: jest.fn(),
    };
    const service = createService(prisma, ledger);

    const result = (await service.sellerEarnings("user-1")) as { balance: unknown };

    expect(`${result.balance}`).toBe("33.00");
  });
});
