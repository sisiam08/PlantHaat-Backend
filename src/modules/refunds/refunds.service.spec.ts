import { jest } from "@jest/globals";

import { ErrorCode } from "../../common/errors/error-codes";
import { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { LedgerService } from "../ledger/ledger.service";
import { RefundsService } from "./refunds.service";

type PrismaMockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const mockFn = (): PrismaMockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

const actor = { id: "admin-1", role: "ADMIN" } as never;

const baseRefund = {
  id: "r-1",
  shopOrderId: "so-1",
  status: "REQUESTED",
  method: null,
  reference: null,
  note: null,
};

function decimal(value: string) {
  return {
    toString: () => value,
    negated: () => decimal(`-${value}`),
  };
}

function createPrismaMock() {
  const tx = {
    refund: { update: mockFn() },
    shopOrder: { findUniqueOrThrow: mockFn() },
  };
  const prismaMock = {
    tx,
    refund: { findUnique: mockFn(), update: mockFn(), findMany: mockFn(), count: mockFn() },
    shopOrder: { findUniqueOrThrow: mockFn() },
    $transaction: mockFn(),
  };
  prismaMock.$transaction.mockImplementation(async (op: unknown) =>
    typeof op === "function" ? op(prismaMock.tx) : Promise.all(op as Promise<unknown>[]),
  );
  return prismaMock;
}

function createService(
  prisma: ReturnType<typeof createPrismaMock>,
  reverseRefund = jest.fn<() => Promise<boolean>>(),
) {
  const audit = { record: jest.fn() } as unknown as AuditService;
  const ledger = {
    reverseRefund,
    balance: jest.fn(),
    list: jest.fn(),
    accountSum: jest.fn(async () => new Prisma.Decimal(0)),
    postRefundObligation: jest.fn(),
    postRefundPaid: jest.fn(),
  } as never as LedgerService;
  return new RefundsService(prisma as unknown as PrismaService, ledger, audit);
}

describe("RefundsService", () => {
  it("lists refunds through a paginated transaction", async () => {
    const prisma = createPrismaMock();
    prisma.$transaction.mockImplementation(async (...args: unknown[]) => {
      const op = args[0] as unknown;
      return Promise.all(op as Promise<unknown>[]);
    });
    prisma.refund.findMany.mockResolvedValue([{ id: "r-1", shopOrder: { id: "so-1" } }]);
    prisma.refund.count.mockResolvedValue(1);
    const service = createService(prisma);

    const result = (await service.list({ page: 1, limit: 20 } as never)) as {
      data: unknown[];
      meta: { total: number };
    };

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it("approves a REQUESTED refund", async () => {
    const prisma = createPrismaMock();
    prisma.refund.findUnique.mockResolvedValue(baseRefund);
    prisma.refund.update.mockResolvedValue({ ...baseRefund, status: "APPROVED" });
    const service = createService(prisma);

    const updated = (await service.approve("r-1", actor, {})) as { status: string };

    expect(updated.status).toBe("APPROVED");
  });

  it("rejects approving a non-REQUESTED refund", async () => {
    const prisma = createPrismaMock();
    prisma.refund.findUnique.mockResolvedValue({ ...baseRefund, status: "APPROVED" });
    const service = createService(prisma);

    await expect(service.approve("r-1", actor, {})).rejects.toMatchObject({
      code: ErrorCode.REFUND_INVALID_STATUS,
    });
  });

  it("rejects rejecting an already-processed refund", async () => {
    const prisma = createPrismaMock();
    prisma.refund.findUnique.mockResolvedValue({ ...baseRefund, status: "PROCESSED" });
    const service = createService(prisma);

    await expect(service.reject("r-1", {} as never, actor, {})).rejects.toMatchObject({
      code: ErrorCode.REFUND_INVALID_STATUS,
      status: 409,
    });
  });

  it("rejects a refund with a note", async () => {
    const prisma = createPrismaMock();
    prisma.refund.findUnique.mockResolvedValue({ ...baseRefund, note: "original" });
    prisma.refund.update.mockResolvedValue({ ...baseRefund, status: "REJECTED" });
    const service = createService(prisma);

    const updated = (await service.reject("r-1", { note: "no" } as never, actor, {})) as {
      status: string;
    };

    expect(updated.status).toBe("REJECTED");
    const updateArg = prisma.refund.update.mock.calls[0][0] as {
      data: { note: string };
      };
    expect(updateArg.data.note).toBe("no");
  });

  it("refuses to process a PROCESSED refund", async () => {
    const prisma = createPrismaMock();
    prisma.refund.findUnique.mockResolvedValue({ ...baseRefund, status: "PROCESSED" });
    const service = createService(prisma);

    await expect(service.process("r-1", {} as never, actor, {})).rejects.toMatchObject({
      code: ErrorCode.REFUND_INVALID_STATUS,
    });
  });

  it("refuses to process a REJECTED refund", async () => {
    const prisma = createPrismaMock();
    prisma.refund.findUnique.mockResolvedValue({ ...baseRefund, status: "REJECTED" });
    const service = createService(prisma);

    await expect(service.process("r-1", {} as never, actor, {})).rejects.toMatchObject({
      code: ErrorCode.REFUND_INVALID_STATUS,
    });
  });

  it("processes a COD refund by crediting the commission back", async () => {
    const prisma = createPrismaMock();
    prisma.refund.findUnique.mockResolvedValue({ ...baseRefund, paymentId: null });
    prisma.tx.refund.update.mockResolvedValue({ ...baseRefund, status: "PROCESSED" });
    prisma.tx.shopOrder.findUniqueOrThrow.mockResolvedValue({
      commissionAmount: decimal("30.00"),
      order: { paymentMethod: "COD" },
      shop: { sellerProfileId: "seller-1" },
    });
    const reverseRefund = jest.fn<() => Promise<boolean>>();
    const service = createService(prisma, reverseRefund);

    const result = (await service.process("r-1", {} as never, actor, {})) as {
      processed: boolean;
    };

    expect(result).toEqual({ processed: true });
    expect(prisma.tx.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PROCESSED" }),
      }),
    );
    expect(reverseRefund).toHaveBeenCalledTimes(1);
    const entry = (reverseRefund as unknown as jest.Mock).mock.calls[0][1] as {
      refundId: string;
      sellerProfileId: string;
      commissionAmount: { toString: () => string };
      paymentMethod: string;
    };
    expect(entry).toMatchObject({
      refundId: "r-1",
      sellerProfileId: "seller-1",
      paymentMethod: "COD",
    });
    expect(entry.commissionAmount.toString()).toBe("30.00");
  });

  it("processes an online refund by reversing the seller share", async () => {
    const prisma = createPrismaMock();
    prisma.refund.findUnique.mockResolvedValue({ ...baseRefund, method: null });
    prisma.tx.refund.update.mockResolvedValue({ ...baseRefund, status: "PROCESSED" });
    prisma.tx.shopOrder.findUniqueOrThrow.mockResolvedValue({
      commissionAmount: decimal("30.00"),
      order: { paymentMethod: "ONLINE" },
      shop: { sellerProfileId: "seller-1" },
    });
    const reverseRefund = jest.fn<() => Promise<boolean>>();
    const service = createService(prisma, reverseRefund);

    await service.process("r-1", {} as never, actor, {});

    const entry = (reverseRefund as unknown as jest.Mock).mock.calls[0][1] as {
      paymentMethod: string;
      commissionAmount: { toString: () => string };
    };
    expect(entry.paymentMethod).toBe("ONLINE");
    expect(entry.commissionAmount.toString()).toBe("30.00");
  });

  it("merges method/reference/note overrides when processing", async () => {
    const prisma = createPrismaMock();
    prisma.refund.findUnique.mockResolvedValue({
      ...baseRefund,
      method: "ONLINE",
      reference: "ref-0",
      note: "keep",
    });
    prisma.tx.refund.update.mockResolvedValue({ ...baseRefund, status: "PROCESSED" });
    prisma.tx.shopOrder.findUniqueOrThrow.mockResolvedValue({
      commissionAmount: decimal("30.00"),
      order: { paymentMethod: "ONLINE" },
      shop: { sellerProfileId: "seller-1" },
    });
    const service = createService(prisma);

    await service.process(
      "r-1",
      { method: "BANK_TRANSFER", reference: "ref-9" } as never,
      actor,
      {},
    );

    const updateArg = prisma.tx.refund.update.mock.calls[0][0] as {
      data: { method: string; reference: string };
    };
    expect(updateArg.data.method).toBe("BANK_TRANSFER");
    expect(updateArg.data.reference).toBe("ref-9");
  });

  it("throws NOT_FOUND for a missing refund", async () => {
    const prisma = createPrismaMock();
    prisma.refund.findUnique.mockResolvedValue(null);
    const service = createService(prisma);

    await expect(service.approve("missing", actor, {})).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});
