import { jest } from "@jest/globals";

import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { LedgerService } from "../ledger/ledger.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { OrdersService } from "../orders/orders.service";
import type { SettingsService } from "../settings/settings.service";
import { ComplaintsService } from "./complaints.service";

type MockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockFn = (): MockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();
const dec = (value: number) => new Prisma.Decimal(value);

const actor = { id: "admin-1", role: "ADMIN" } as unknown as AuthenticatedUser;
const meta = {};

function createService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    shopOrder: { findUnique: mockFn() },
    complaint: {
      create: mockFn(),
      update: mockFn(),
      findUnique: mockFn(),
      findFirst: mockFn(),
      findMany: mockFn(),
      count: mockFn(),
    },
    sellerProfile: { update: mockFn() },
    refund: { create: mockFn() },
    $queryRaw: mockFn().mockResolvedValue([]),
    $transaction: mockFn(),
    ...overrides,
  };
  prisma.$transaction.mockImplementation(async (op: unknown) =>
    typeof op === "function" ? (op(prisma) as unknown) : Promise.all(op as never),
  );
  const settings = {
    getNumber: mockFn().mockResolvedValue(48),
    getBoolean: mockFn().mockResolvedValue(false),
  } as unknown as SettingsService;
  const notifications = {
    create: mockFn(),
    createForAdmins: mockFn(),
  } as unknown as NotificationsService;
  const audit = { record: mockFn() } as unknown as AuditService;
  const ledger = {
    reverseRefund: mockFn().mockResolvedValue(true),
    holdForDispute: mockFn().mockResolvedValue(dec(0)),
    accountSum: mockFn().mockResolvedValue(dec(0)),
    releaseDisputeHold: mockFn(),
    postRefundObligation: mockFn(),
    postRefundPaid: mockFn(),
  } as unknown as LedgerService;
  const orders = {
    createReplacementFromComplaint: mockFn().mockResolvedValue({
      orderId: "replacement-order",
      shopOrderId: "replacement-shop-order",
    }),
  } as unknown as OrdersService;
  const service = new ComplaintsService(prisma as unknown as PrismaService, settings, notifications, audit, ledger, orders);
  return { service, prisma, settings, notifications, audit, ledger, orders };
}

const deliveredShopOrder = {
  id: "so-1",
  shopOrderNumber: "SO-1",
  shopId: "shop-1",
  status: "DELIVERED",
  deliveredAt: new Date(),
  shop: {
    id: "shop-1",
    name: "Green Shop",
    sellerProfile: { id: "seller-1", userId: "seller-user" },
  },
  order: { customerId: "customer-1" },
};

const createDto = (overrides: Record<string, unknown> = {}) =>
  ({
    shopOrderId: "so-1",
    type: "NOT_DELIVERED",
    description: "The plant never arrived at my address",
    ...overrides,
  }) as never;

describe("ComplaintsService", () => {
  it("accepts NOT_DELIVERED on a delivered order, flags the seller and alerts admins", async () => {
    const { service, prisma, notifications } = createService();
    prisma.shopOrder.findUnique.mockResolvedValue(deliveredShopOrder);
    prisma.complaint.create.mockResolvedValue({ id: "cmp-1", ticketNumber: "CMP-1" });
    prisma.sellerProfile.update.mockResolvedValue({ falseDeliveryFlags: 2 });
    (notifications.create as MockFn).mockResolvedValue(undefined);

    const result = (await service.create("customer-1", createDto())) as { id: string };

    expect(result.id).toBe("cmp-1");
    expect(prisma.sellerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "seller-1" },
        data: { falseDeliveryFlags: { increment: 1 } },
      }),
    );
    expect(notifications.createForAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "FALSE_DELIVERY_FLAG",
        data: expect.objectContaining({ sellerFalseDeliveryFlags: 2 }),
      }),
    );
  });

  it("rejects NOT_DELIVERED on a delivered order outside the complaint window", async () => {
    const { service, prisma, settings } = createService();
    prisma.shopOrder.findUnique.mockResolvedValue({
      ...deliveredShopOrder,
      deliveredAt: new Date(Date.now() - 72 * 3_600_000),
    });

    await expect(service.create("customer-1", createDto())).rejects.toMatchObject({
      code: ErrorCode.COMPLAINT_WINDOW_CLOSED,
    });
    expect(prisma.complaint.create).not.toHaveBeenCalled();
    expect(settings.getNumber).toHaveBeenCalledWith("return.windowHours");
  });

  it("rejects NOT_DELIVERED on a pending order", async () => {
    const { service, prisma } = createService();
    prisma.shopOrder.findUnique.mockResolvedValue({ ...deliveredShopOrder, status: "PENDING" });

    await expect(service.create("customer-1", createDto())).rejects.toMatchObject({
      code: ErrorCode.COMPLAINT_NOT_ALLOWED,
    });
  });

  it("creates a refund and reverses the ledger when resolved as a refund", async () => {
    const { service, prisma, ledger } = createService();
    const complaint = {
      id: "cmp-1",
      shopOrderId: "so-1",
      status: "OPEN",
      customerId: "customer-1",
      shopOrder: {
        id: "so-1",
        shopOrderNumber: "SO-1",
        total: dec(160),
        commissionAmount: dec(10),
        status: "DELIVERED",
        order: { paymentMethod: "COD" },
        shop: { sellerProfileId: "seller-1" },
      },
      shop: { sellerProfile: { userId: "seller-user" } },
    };
    prisma.complaint.findUnique.mockResolvedValue(complaint);
    prisma.complaint.update.mockResolvedValue(complaint);
    prisma.refund.create.mockResolvedValue({ id: "refund-1" });

    await service.resolve("cmp-1", {
      status: "RESOLVED_REFUND",
      resolutionNote: "Not delivered",
    } as never, actor, meta);

    expect(prisma.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: dec(160), status: "REQUESTED" }),
      }),
    );
    expect(ledger.reverseRefund).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        refundId: "refund-1",
        sellerProfileId: "seller-1",
        commissionAmount: dec(10),
        paymentMethod: "COD",
      }),
    );
  });

  it("creates a replacement shop order when resolved as a replacement", async () => {
    const { service, prisma, orders } = createService();
    prisma.complaint.findUnique.mockResolvedValue({
      id: "cmp-1",
      shopOrderId: "so-1",
      status: "OPEN",
      customerId: "customer-1",
      shopOrder: {
        id: "so-1",
        shopOrderNumber: "SO-1",
        total: dec(160),
        commissionAmount: dec(10),
        status: "DELIVERED",
        order: { paymentMethod: "COD" },
        shop: { sellerProfileId: "seller-1" },
      },
      shop: { sellerProfile: { userId: "seller-user" } },
    });
    prisma.complaint.update.mockResolvedValue({});

    await service.resolve(
      "cmp-1",
      { status: "RESOLVED_REPLACEMENT", resolutionNote: "Send a new plant" } as never,
      actor,
      meta,
    );

    expect(orders.createReplacementFromComplaint).toHaveBeenCalledWith({
      parentShopOrderId: "so-1",
      complaintId: "cmp-1",
      actorId: "admin-1",
    });
  });

  it("blocks resolving through the plain status endpoint", async () => {
    const { service, prisma } = createService();
    prisma.complaint.findUnique.mockResolvedValue({ id: "cmp-1" });

    await expect(
      service.updateStatus("cmp-1", { status: "RESOLVED_REFUND" } as never, actor, meta),
    ).rejects.toMatchObject({ code: ErrorCode.COMPLAINT_NOT_ALLOWED });
  });
  it("builds admin dispute filters for seller, age and amount", async () => {
    const { service, prisma } = createService();
    prisma.complaint.findMany.mockResolvedValue([]);
    prisma.complaint.count.mockResolvedValue(0);

    await service.listAll({
      page: 1,
      limit: 20,
      status: "OPEN",
      seller: "Green",
      minAgeHours: 2,
      maxAgeHours: 48,
      minAmount: 100,
      maxAmount: 2000,
    } as never);

    const arg = prisma.complaint.findMany.mock.calls[0][0] as {
      where: {
        status: string;
        shop: { is: { OR: unknown[] } };
        createdAt: { lte: Date; gte: Date };
        shopOrder: { is: { total: { gte: number; lte: number } } };
      };
    };
    expect(arg.where.status).toBe("OPEN");
    expect(arg.where.shop.is.OR).toHaveLength(2);
    expect(arg.where.createdAt.lte.getTime()).toBeGreaterThan(arg.where.createdAt.gte.getTime());
    expect(arg.where.shopOrder.is.total).toEqual({ gte: 100, lte: 2000 });
  });
});
