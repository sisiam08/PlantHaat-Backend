import { jest } from "@jest/globals";
import type { EventEmitter2 } from "@nestjs/event-emitter";

import { ErrorCode } from "../../common/errors/error-codes";
import { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { CodRiskService } from "../cod-risk/cod-risk.service";
import type { CommissionsService } from "../commissions/commissions.service";
import type { LedgerService } from "../ledger/ledger.service";
import type { MailService } from "../mail/mail.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { SettingsService } from "../settings/settings.service";

jest.unstable_mockModule("./delivery-zone.resolver", () => ({
  resolveDeliveryZone: jest.fn(),
}));

const { OrdersService } = (await import("./orders.service")) as {
  OrdersService: typeof import("./orders.service").OrdersService;
};
const { resolveDeliveryZone } = (await import("./delivery-zone.resolver")) as {
  resolveDeliveryZone: unknown;
};

const resolveDeliveryZoneMock = resolveDeliveryZone as {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
  mockReset: () => void;
};

type PrismaMockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const mockFn = (): PrismaMockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

const dec = (value: number) => new Prisma.Decimal(value);

function createPrismaMock() {
  const bag = {
    address: { findFirst: mockFn() },
    cart: { findUnique: mockFn() },
    cartItem: { deleteMany: mockFn() },
    product: { update: mockFn() },
    productVariant: {
      findUniqueOrThrow: mockFn(),
      findMany: mockFn(),
      update: mockFn(),
      updateMany: mockFn(),
    },
    inventoryLog: { create: mockFn() },
    order: {
      create: mockFn(),
      findFirst: mockFn(),
      findUnique: mockFn(),
      findMany: mockFn(),
      count: mockFn(),
      update: mockFn(),
    },
    shopOrder: {
      findFirst: mockFn(),
      findUnique: mockFn(),
      findUniqueOrThrow: mockFn(),
      findMany: mockFn(),
      count: mockFn(),
      create: mockFn(),
      update: mockFn(),
    },
    orderItem: { create: mockFn() },
    orderStatusHistory: { create: mockFn() },
    payment: { create: mockFn(), findMany: mockFn(), updateMany: mockFn() },
    paymentIntent: { findUnique: mockFn() },
    paymentSubmission: { aggregate: mockFn() },
    cancellationRequest: {
      findFirst: mockFn(),
      findUnique: mockFn(),
      create: mockFn(),
      update: mockFn(),
      findMany: mockFn(),
      count: mockFn(),
    },
    notification: { create: mockFn(), createMany: mockFn() },
    user: { findMany: mockFn(), findUnique: mockFn() },
    sellerProfile: { findUnique: mockFn(), update: mockFn() },
    refund: { create: mockFn() },
  } satisfies Record<string, Record<string, PrismaMockFn>>;
  const prisma = {
    ...bag,
    $transaction: mockFn(),
    $queryRaw: mockFn(),
  };
  prisma.$transaction.mockImplementation(async (op: unknown) =>
    typeof op === "function"
      ? (op(prisma) as unknown)
      : Promise.all(op as unknown as Promise<unknown>[]),
  );
  // Sensible defaults so transaction bodies do not crash on mock reads;
  // tests override these where they care.
  bag.order.create.mockResolvedValue({ id: "order-1" });
  bag.user.findUnique.mockResolvedValue({ phone: null });
  bag.shopOrder.create.mockResolvedValue({ id: "shop-order-1" });
  bag.productVariant.update.mockResolvedValue({ stockQty: 5 });
  bag.productVariant.updateMany.mockResolvedValue({ count: 1 });
  return { prisma, bag };
}

function createService(prismaBag: ReturnType<typeof createPrismaMock>) {
  const commissions = {
    resolveRatePercent: jest.fn<() => Promise<unknown>>().mockResolvedValue(dec(10)),
  } as unknown as CommissionsService;
  const settings = {
    getBoolean: jest
      .fn<(key: string) => Promise<boolean>>()
      .mockImplementation(async (key) => key === "payment.cod.enabled"),
    getNumber: jest.fn<() => Promise<number>>().mockResolvedValue(0),
  } as unknown as SettingsService;
  const notifications = { create: jest.fn() } as never as NotificationsService;
  const ledger = {
    record: jest.fn<() => Promise<void>>(),
    postCodDues: jest.fn<() => Promise<void>>(),
    postAdvanceDelivery: jest.fn<() => Promise<void>>(),
    postPaymentReceipt: jest.fn<() => Promise<void>>(),
    releaseAtFor: jest.fn(async () => new Date()),
  } as never as LedgerService;
  const events = { emit: jest.fn() } as unknown as EventEmitter2;
  const mail = { queue: jest.fn() } as never as MailService;
  const codRiskMock = {
    assess: jest.fn(),
    fingerprint: jest.fn(),
    recordFailure: jest.fn(),
    recordDelivery: jest.fn(),
    riskByPhones: jest.fn(),
    normalize: jest.fn((value: string | null) => value),
  };
  (codRiskMock.riskByPhones as unknown as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue(new Map());
  (codRiskMock.assess as unknown as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue({
    status: "OK",
    capExceeded: false,
  });
  const codRisk = codRiskMock as unknown as CodRiskService;
  const payments = {
    snapshot: jest.fn(async () => ({ providers: [] })),
    createIntent: jest.fn(),
    createCancellationRefund: jest.fn(),
  } as never;
  const service = new OrdersService(
    prismaBag.prisma as unknown as PrismaService,
    commissions,
    settings,
    notifications,
    ledger,
    events,
    mail,
    codRisk,
    payments,
    { attachAssetsInTransaction: jest.fn() } as never,
  );
  return { service, commissions, settings, ledger, events, mail };
}

function variantFixture(
  overrides: {
    shop?: Record<string, unknown>;
    product?: Record<string, unknown>;
    [key: string]: unknown;
  } = {},
) {
  const { shop: shopOverride, product: productOverride, ...rest } = overrides;
  const shop = {
    id: "shop-1",
    name: "Shop One",
    slug: "shop-one",
    status: "ACTIVE",
    isOnVacation: false,
    sellerProfile: { id: "seller-1", userId: "user-seller", status: "APPROVED" },
    ...shopOverride,
  } as never;
  const product = {
    id: "product-1",
    name: "Monstera",
    slug: "monstera",
    status: "ACTIVE",
    deletedAt: null,
    category: { id: "cat-1", parentId: null },
    shop,
    ...productOverride,
  } as never;
  return {
    id: "variant-1",
    name: "Standard",
    price: dec(100),
    stockQty: 5,
    isActive: true,
    product,
    ...rest,
  } as never;
}

const addressFixture = {
  id: "addr-1",
  recipientName: "Customer",
  phone: "01712345678",
  districtId: 1,
  district: { id: 1, name: "Dhaka" },
  area: "Mirpur",
  addressLine: "House 1",
  postalCode: null,
};

const zoneFixture = {
  zoneId: "zone-1",
  name: "Zone",
  charge: dec(60),
  freeDeliveryAbove: null,
  estimatedDaysMin: 2,
  estimatedDaysMax: 4,
};

function checkoutDto(overrides: Record<string, unknown> = {}) {
  return { addressId: "addr-1", paymentMethod: "COD", note: undefined, ...overrides } as never;
}

const shopOrderId = "so-1";

const actorSeller = { id: "user-seller", role: "SELLER" } as unknown as AuthenticatedUser;

const shopOrderFixture = (overrides: Record<string, unknown> = {}): never => ({
  id: shopOrderId,
  shopOrderNumber: "O-1-1",
  orderId: "order-1",
  shopId: "shop-1",
  status: "PENDING",
  subtotal: dec(100),
  total: dec(160),
  commissionAmount: dec(10),
  sellerNetAmount: dec(150),
  deliveryCharge: dec(60),
  courierName: null,
  trackingCode: null,
  estimatedDeliveryFrom: null,
  estimatedDeliveryTo: null,
  items: [{ variantId: "variant-1", productId: "product-1", quantity: 1 }],
  payments: [],
  order: { id: "order-1", customerId: "c-1", paymentMethod: "COD" },
  shop: { id: "shop-1", sellerProfile: { id: "seller-1", userId: "user-seller" } },
  ...overrides,
} as never);

function setupTransition(fixture: never) {
  const bag = createPrismaMock();
  bag.prisma.shopOrder.findUnique.mockResolvedValue(fixture);
  bag.prisma.shopOrder.findUniqueOrThrow.mockResolvedValue(fixture);
  bag.prisma.productVariant.findMany.mockResolvedValue([]);
  bag.prisma.payment.findMany.mockResolvedValue([{ status: "PAID" }]);
  return { bag, deps: createService(bag) };
}

describe("OrdersService", () => {
  beforeEach(() => {
    resolveDeliveryZoneMock.mockReset();
  });

  describe("checkout", () => {
    const emptyCart = { id: "cart-1", items: [] };

    function setupCartService(variants: readonly never[]) {
      const bag = createPrismaMock();
      bag.prisma.address.findFirst.mockResolvedValue(addressFixture);
      bag.prisma.cart.findUnique.mockResolvedValue({
        id: "cart-1",
        items: variants.map((v) => ({ variant: v, quantity: 1 })),
      });
      const deps = createService(bag);
      return { bag, deps };
    }

    it("requires an Idempotency-Key", async () => {
      const bag = createPrismaMock();
      const { service } = createService(bag);

      await expect(service.checkout("u1", checkoutDto(), undefined)).rejects.toMatchObject({
        code: ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
      });
    });

    it("refuses online payments while disabled", async () => {
      const bag = createPrismaMock();
      const { service } = createService(bag);

      await expect(
        service.checkout("u1", checkoutDto({ paymentMethod: "ONLINE" }), "idem"),
      ).rejects.toMatchObject({ code: ErrorCode.PAYMENT_METHOD_NOT_AVAILABLE });
      expect(bag.prisma.cart.findUnique).not.toHaveBeenCalled();
    });

    it("returns the existing order for a repeated idempotency key", async () => {
      const bag = createPrismaMock();
      const { service } = createService(bag);
      const detail = { id: "order-1", customerId: "u1", shopOrders: [{ status: "PENDING" }] };
      bag.prisma.order.findFirst.mockResolvedValue(detail);

      const result = (await service.checkout("u1", checkoutDto(), "idem")) as { id: string };

      expect(result.id).toBe("order-1");
      expect(bag.prisma.cart.findUnique).not.toHaveBeenCalled();
    });

    it("throws ADDRESS_NOT_FOUND when the address does not belong to the customer", async () => {
      const bag = createPrismaMock();
      bag.prisma.address.findFirst.mockResolvedValue(null);
      const { service } = createService(bag);

      await expect(service.checkout("u1", checkoutDto(), "idem")).rejects.toMatchObject({
        code: ErrorCode.ADDRESS_NOT_FOUND,
      });
    });

    it("throws CART_EMPTY for an empty cart", async () => {
      const bag = createPrismaMock();
      bag.prisma.address.findFirst.mockResolvedValue(addressFixture);
      bag.prisma.cart.findUnique.mockResolvedValue(emptyCart);
      const { service } = createService(bag);

      await expect(service.checkout("u1", checkoutDto(), "idem")).rejects.toMatchObject({
        code: ErrorCode.CART_EMPTY,
      });
    });

    it("rejects an unavailable product", async () => {
      const { deps } = setupCartService([
        variantFixture({
          product: { status: "DRAFT" } as never,
        }),
      ]);
      resolveDeliveryZoneMock.mockResolvedValue(zoneFixture);

      await expect(deps.service.checkout("u1", checkoutDto(), "idem")).rejects.toMatchObject({
        code: ErrorCode.CHECKOUT_VALIDATION_FAILED,
        details: [{ code: "PRODUCT_UNAVAILABLE" }],
      });
    });

    it("rejects an inactive variant", async () => {
      const { deps } = setupCartService([variantFixture({ isActive: false })]);

      await expect(deps.service.checkout("u1", checkoutDto(), "idem")).rejects.toMatchObject({
        details: [{ code: "VARIANT_UNAVAILABLE" }],
      });
    });

    it("rejects a non-approved seller", async () => {
      const { deps } = setupCartService([
        variantFixture({
          shop: { sellerProfile: { id: "seller-1", userId: "u", status: "PENDING_REVIEW" } },
        }),
      ]);

      await expect(deps.service.checkout("u1", checkoutDto(), "idem")).rejects.toMatchObject({
        details: [{ code: "SHOP_UNAVAILABLE" }],
      });
    });

    it("rejects a shop on vacation", async () => {
      const { deps } = setupCartService([variantFixture({ shop: { isOnVacation: true } })]);

      await expect(deps.service.checkout("u1", checkoutDto(), "idem")).rejects.toMatchObject({
        details: [{ code: "SHOP_ON_VACATION" }],
      });
    });

    it("rejects insufficient stock", async () => {
      const { deps } = setupCartService([variantFixture({ stockQty: 0 })]);
      resolveDeliveryZoneMock.mockResolvedValue(zoneFixture);

      await expect(deps.service.checkout("u1", checkoutDto(), "idem")).rejects.toMatchObject({
        details: [{ code: "INSUFFICIENT_STOCK", available: 0 }],
      });
    });

    it("rejects when the shop does not deliver to the district", async () => {
      const { deps } = setupCartService([variantFixture()]);
      resolveDeliveryZoneMock.mockResolvedValue(null);

      await expect(deps.service.checkout("u1", checkoutDto(), "idem")).rejects.toMatchObject({
        details: [{ code: "SHOP_NOT_DELIVERING_TO_DISTRICT" }],
      });
    });

    it("returns 409 PRICE_CHANGED with the changed lines and applies nothing", async () => {
      const bag = createPrismaMock();
      const variant = variantFixture({ price: dec(120) });
      bag.prisma.address.findFirst.mockResolvedValue(addressFixture);
      bag.prisma.cart.findUnique.mockResolvedValue({
        id: "cart-1",
        items: [{ variant, variantId: "variant-1", quantity: 1, priceSnapshot: dec(100) }],
      });
      resolveDeliveryZoneMock.mockResolvedValue(zoneFixture);
      const { service } = createService(bag);

      await expect(
        service.checkout("u1", checkoutDto({ expectedGrandTotal: 160 }), "idem"),
      ).rejects.toMatchObject({
        code: ErrorCode.PRICE_CHANGED,
        details: {
          expectedGrandTotal: "160",
          grandTotal: "180",
          changedLines: [
            {
              variantId: "variant-1",
              from: "100",
              to: "120",
            },
          ],
        },
      });
      expect(bag.prisma.$transaction).not.toHaveBeenCalled();
      expect(bag.prisma.order.create).not.toHaveBeenCalled();
    });

    it("places a successful COD order: totals, payment, history, stock and cart cleanup", async () => {
      const { bag, deps } = setupCartService([variantFixture({ stockQty: 3 }) as never]);
      resolveDeliveryZoneMock.mockResolvedValue(zoneFixture);
      bag.prisma.productVariant.findUniqueOrThrow.mockResolvedValue({ stockQty: 2 });
      bag.prisma.productVariant.findMany.mockResolvedValue([{ price: dec(100), stockQty: 2 }]);
      bag.prisma.order.findFirst
        .mockResolvedValueOnce(null) // idempotency pre-check
        .mockResolvedValue({
          id: "order-1",
          customerId: "u1",
          shopOrders: [{ status: "PENDING" }],
        } as never);

      const result = (await deps.service.checkout("u1", checkoutDto(), "idem")) as { id: string };

      expect(result.id).toBe("order-1");
      const orderArg = bag.prisma.order.create.mock.calls[0][0] as {
        data: { subtotal: Prisma.Decimal; grandTotal: Prisma.Decimal };
      };
      expect(`${orderArg.data.subtotal}`).toBe("100");
      expect(`${orderArg.data.grandTotal}`).toBe("160");
      const shopOrderArg = bag.prisma.shopOrder.create.mock.calls[0][0] as {
        data: {
          commissionAmount: Prisma.Decimal;
          sellerNetAmount: Prisma.Decimal;
          deliveryCharge: Prisma.Decimal;
        };
      };
      expect(`${shopOrderArg.data.commissionAmount}`).toBe("10");
      expect(`${shopOrderArg.data.sellerNetAmount}`).toBe("150");
      expect(`${shopOrderArg.data.deliveryCharge}`).toBe("60");
      const paymentArg = bag.prisma.payment.create.mock.calls[0][0] as {
        data: { status: string; amount: Prisma.Decimal };
      };
      expect(paymentArg.data.status).toBe("PENDING");
      expect(`${paymentArg.data.amount}`).toBe("160");
      expect(bag.prisma.orderStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ toStatus: "PENDING" }),
        }),
      );
      const decrement = bag.prisma.productVariant.updateMany.mock.calls[0][0] as {
        where: { id: string; stockQty: { gte: number } };
      };
      expect(decrement.where.stockQty.gte).toBe(1);
      expect(bag.prisma.cartItem.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { cartId: "cart-1", variantId: { in: ["variant-1"] } },
        }),
      );
      expect(deps.events.emit).toHaveBeenCalledWith(
        "order.placed",
        expect.objectContaining({ customerId: "u1", sellerUserIds: ["user-seller"] }),
      );
      expect(bag.prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ minPrice: dec(100), maxPrice: dec(100), inStock: true }),
        }),
      );
    });

    it("makes delivery free once the group crosses the threshold", async () => {
      const { bag, deps } = setupCartService([variantFixture({ stockQty: 10 }) as never]);
      resolveDeliveryZoneMock.mockResolvedValue({
        ...zoneFixture,
        freeDeliveryAbove: dec(100),
      });
      bag.prisma.productVariant.findUniqueOrThrow.mockResolvedValue({ stockQty: 9 });
      bag.prisma.productVariant.findMany.mockResolvedValue([{ price: dec(100), stockQty: 9 }]);
      bag.prisma.order.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValue({
          id: "order-1",
          customerId: "u1",
          shopOrders: [{ status: "PENDING" }],
        } as never);

      await deps.service.checkout("u1", checkoutDto(), "idem");

      const orderArg = bag.prisma.order.create.mock.calls[0][0] as {
        data: { deliveryTotal: Prisma.Decimal; grandTotal: Prisma.Decimal };
      };
      expect(`${orderArg.data.deliveryTotal}`).toBe("0");
      expect(`${orderArg.data.grandTotal}`).toBe("100");
      const shopOrderArg = bag.prisma.shopOrder.create.mock.calls[0][0] as {
        data: { deliveryCharge: Prisma.Decimal; sellerNetAmount: Prisma.Decimal };
      };
      expect(`${shopOrderArg.data.deliveryCharge}`).toBe("0");
      expect(`${shopOrderArg.data.sellerNetAmount}`).toBe("90");
    });

    it("loses the last-unit race with INSUFFICIENT_STOCK inside the transaction", async () => {
      const { bag, deps } = setupCartService([variantFixture({ stockQty: 3 }) as never]);
      resolveDeliveryZoneMock.mockResolvedValue(zoneFixture);
      bag.prisma.order.findFirst.mockResolvedValue(null);
      bag.prisma.productVariant.updateMany.mockResolvedValue({ count: 0 });

      await expect(deps.service.checkout("u1", checkoutDto(), "idem")).rejects.toMatchObject({
        code: ErrorCode.INSUFFICIENT_STOCK,
      });
    });

    it("recovers from an idempotency-key collision that races with another request", async () => {
      const bag = createPrismaMock();
      const { service } = createService(bag);
      bag.prisma.address.findFirst.mockResolvedValue(addressFixture);
      bag.prisma.cart.findUnique.mockResolvedValue({
        id: "cart-1",
        items: [{ variant: variantFixture({ stockQty: 3 }), quantity: 1 }],
      });
      resolveDeliveryZoneMock.mockResolvedValue(zoneFixture);
      bag.prisma.productVariant.findUniqueOrThrow.mockResolvedValue({ stockQty: 2 });
      bag.prisma.productVariant.findMany.mockResolvedValue([{ price: dec(100), stockQty: 2 }]);
      bag.prisma.order.findFirst
        .mockResolvedValueOnce(null) // pre-check: no existing order yet
        .mockResolvedValueOnce({ id: "winner" }) // lookup after the P2002
        .mockResolvedValueOnce({
          // getCustomerOrder after the checkout resolves
          id: "winner",
          customerId: "u1",
          shopOrders: [{ status: "PENDING" }],
        } as never);
      bag.prisma.order.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("unique", {
          code: "P2002",
          clientVersion: "mock",
          meta: { target: ["order_customerId_idempotencyKey_key"] },
        }),
      );

      const result = (await service.checkout("u1", checkoutDto(), "idem")) as { id: string };

      expect(result.id).toBe("winner");
    });

    it("retries with a new order number when the number collides", async () => {
      const { bag, deps } = setupCartService([variantFixture({ stockQty: 3 }) as never]);
      resolveDeliveryZoneMock.mockResolvedValue(zoneFixture);
      bag.prisma.productVariant.findUniqueOrThrow.mockResolvedValue({ stockQty: 2 });
      bag.prisma.productVariant.findMany.mockResolvedValue([{ price: dec(100), stockQty: 2 }]);
      bag.prisma.order.findFirst
        .mockResolvedValueOnce(null) // pre-check
        .mockResolvedValue({
          // getCustomerOrder after the retry succeeds
          id: "order-1",
          customerId: "u1",
          shopOrders: [{ status: "PENDING" }],
        } as never);
      bag.prisma.shopOrder.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("unique", {
          code: "P2002",
          clientVersion: "mock",
          meta: { target: ["shop_order_shopOrderNumber_key"] },
        }),
      );

      const result = (await deps.service.checkout("u1", checkoutDto(), "idem")) as { id: string };

      expect(result.id).toBe("order-1");
      expect(bag.prisma.shopOrder.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("transitions", () => {
    it("throws ORDER_NOT_FOUND for an unknown shop order", async () => {
      const bag = createPrismaMock();
      bag.prisma.shopOrder.findUnique.mockResolvedValue(null);
      const { service } = createService(bag);

      await expect(
        service.transitionByAdmin("nope", { status: "CANCELLED" } as never),
      ).rejects.toMatchObject({ code: ErrorCode.ORDER_NOT_FOUND });
    });

    it("hides other sellers' shop orders", async () => {
      const { deps } = setupTransition(
        shopOrderFixture({
          shop: { id: "shop-2", sellerProfile: { id: "s2", userId: "other" } },
        }),
      );

      await expect(
        deps.service.transitionBySeller("user-seller", shopOrderId, { status: "CONFIRMED" } as never),
      ).rejects.toMatchObject({ code: ErrorCode.ORDER_NOT_FOUND });
    });

    it("enforces the state machine", async () => {
      const { deps } = setupTransition(shopOrderFixture({ status: "PENDING" }));

      await expect(
        deps.service.transitionBySeller("user-seller", shopOrderId, { status: "DELIVERED" } as never),
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_STATUS_TRANSITION });
    });

    it("cancels from PENDING: restocks, cancels pending payments, writes history and emits", async () => {
      const { bag, deps } = setupTransition(shopOrderFixture({ status: "PENDING" }));

      await deps.service.transitionBySeller("user-seller", shopOrderId, {
        status: "CANCELLED",
        note: "bye",
      } as never);

      const updateArg = bag.prisma.shopOrder.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateArg.data.status).toBe("CANCELLED");
      expect(updateArg.data.cancelledAt).toBeInstanceOf(Date);
      expect(updateArg.data.cancelReason).toBe("bye");
      expect(bag.prisma.productVariant.update).toHaveBeenCalled();
      expect(bag.prisma.inventoryLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reason: "ORDER_CANCELLED", delta: 1 }),
        }),
      );
      expect(bag.prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { shopOrderId, status: { in: ["PENDING", "FAILED"] } },
        }),
      );
      expect(bag.prisma.orderStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromStatus: "PENDING",
            toStatus: "CANCELLED",
          }),
        }),
      );
      expect(deps.events.emit).toHaveBeenCalledWith(
        "order.status_changed",
        expect.objectContaining({ shopOrderId, status: "CANCELLED" }),
      );
      expect(bag.prisma.shopOrder.findUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: shopOrderId } }),
      );
    });

    it("does not restock when cancelling from FAILED_DELIVERY without restock", async () => {
      const { bag, deps } = setupTransition(shopOrderFixture({ status: "FAILED_DELIVERY" }));

      await deps.service.transitionByAdmin(shopOrderId, { status: "CANCELLED" } as never);

      expect(bag.prisma.productVariant.update).not.toHaveBeenCalled();
      expect(bag.prisma.product.update).not.toHaveBeenCalled();
    });

    it("restocks on cancellation from FAILED_DELIVERY when requested", async () => {
      const { bag, deps } = setupTransition(shopOrderFixture({ status: "FAILED_DELIVERY" }));

      await deps.service.transitionByAdmin(shopOrderId, {
        status: "CANCELLED",
        restock: true,
      } as never);

      expect(bag.prisma.productVariant.update).toHaveBeenCalled();
    });

    it("ships with courier fields and stamps shippedAt", async () => {
      const { bag, deps } = setupTransition(shopOrderFixture({ status: "PACKED" }));

      await deps.service.transitionBySeller("user-seller", shopOrderId, {
        status: "SHIPPED",
        courierName: "Pathao",
        trackingCode: "TRK-1",
      } as never);

      const updateArg = bag.prisma.shopOrder.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateArg.data.status).toBe("SHIPPED");
      expect(updateArg.data.shippedAt).toBeInstanceOf(Date);
      expect(updateArg.data.courierName).toBe("Pathao");
      expect(updateArg.data.trackingCode).toBe("TRK-1");
    });

    it("marks COD payments PAID and books COD commission due on delivery", async () => {
      const { bag, deps } = setupTransition(shopOrderFixture({ status: "SHIPPED" }));

      await deps.service.transitionBySeller("user-seller", shopOrderId, {
        status: "DELIVERED",
      } as never);

      const manyArg = bag.prisma.payment.updateMany.mock.calls[0][0] as {
        where: { shopOrderId: string; method: string; status: string };
      };
      expect(manyArg.where).toEqual({ shopOrderId, method: "COD", status: "PENDING" });
      const ledgerCall = (deps.ledger.postCodDues as unknown as jest.Mock).mock.calls[0][1] as {
        commission: Prisma.Decimal;
      };
      expect(`${ledgerCall.commission}`).toBe("10");
      expect(deps.ledger.record).not.toHaveBeenCalled();
      expect(bag.prisma.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ soldCount: { increment: 1 } }),
        }),
      );
    });

    it("books ORDER_EARNING on delivery when the order was paid online", async () => {
      const { deps } = setupTransition(
        shopOrderFixture({
          status: "SHIPPED",
          order: { id: "order-1", customerId: "c-1", paymentMethod: "ONLINE" },
        }),
      );

      await deps.service.transitionByAdmin(shopOrderId, { status: "DELIVERED" } as never);

      const ledgerCall = (deps.ledger.postAdvanceDelivery as unknown as jest.Mock).mock
        .calls[0][1] as { net: Prisma.Decimal; commission: Prisma.Decimal };
      expect(`${ledgerCall.net}`).toBe("150");
      expect(`${ledgerCall.commission}`).toBe("10");
      expect(deps.ledger.record).not.toHaveBeenCalled();
    });

    it("requires the customer to own the order before cancelling", async () => {
      const bag = createPrismaMock();
      bag.prisma.shopOrder.findFirst.mockResolvedValue(null);
      const { service } = createService(bag);

      await expect(
        service.cancelByCustomer("c-1", shopOrderId, { reason: "why" } as never),
      ).rejects.toMatchObject({ code: ErrorCode.ORDER_NOT_FOUND });
    });

    it("cancels from PENDING for the owning customer", async () => {
      const bag = createPrismaMock();
      bag.prisma.shopOrder.findFirst.mockResolvedValue({ id: shopOrderId, status: "PENDING" });
      bag.prisma.shopOrder.findUnique.mockResolvedValue(shopOrderFixture());
      bag.prisma.shopOrder.findUniqueOrThrow.mockResolvedValue(shopOrderFixture());
      bag.prisma.productVariant.findMany.mockResolvedValue([]);
      const { service } = createService(bag);

      await service.cancelByCustomer("c-1", shopOrderId, { reason: "why" } as never);

      const history = bag.prisma.orderStatusHistory.create.mock.calls[0][0] as {
        data: { changedByRole: string };
      };
      expect(history.data.changedByRole).toBe("CUSTOMER");
    });
  });

  describe("cancellation requests", () => {
    it("refuses requests for orders beyond CONFIRMED/PACKED", async () => {
      const bag = createPrismaMock();
      bag.prisma.shopOrder.findFirst.mockResolvedValue(null);
      const { service } = createService(bag);

      await expect(
        service.createCancellationRequest("c-1", "so-1", { reason: "x" } as never),
      ).rejects.toMatchObject({ code: ErrorCode.CANCELLATION_NOT_ALLOWED });
    });

    it("refuses a second pending request", async () => {
      const bag = createPrismaMock();
      bag.prisma.shopOrder.findFirst.mockResolvedValue({ id: "so-1" });
      bag.prisma.cancellationRequest.findFirst.mockResolvedValue({ id: "cr-1" });
      const { service } = createService(bag);

      await expect(
        service.createCancellationRequest("c-1", "so-1", { reason: "x" } as never),
      ).rejects.toMatchObject({ code: ErrorCode.CANCELLATION_REQUEST_PENDING });
    });

    it("creates a pending request", async () => {
      const bag = createPrismaMock();
      bag.prisma.shopOrder.findFirst.mockResolvedValue({ id: "so-1" });
      bag.prisma.cancellationRequest.findFirst.mockResolvedValue(null);
      bag.prisma.cancellationRequest.create.mockResolvedValue({ id: "cr-2", status: "PENDING" });
      const { service } = createService(bag);

      const created = await service.createCancellationRequest(
        "c-1",
        "so-1",
        { reason: "changed my mind" } as never,
      );

      expect((created as { id: string }).id).toBe("cr-2");
    });

    it("hides other sellers' cancellation requests", async () => {
      const bag = createPrismaMock();
      bag.prisma.cancellationRequest.findUnique.mockResolvedValue({
        id: "cr-1",
        status: "PENDING",
        shopOrderId: "so-1",
        reason: "x",
        shopOrder: { shop: { sellerProfile: { userId: "someone-else" } } },
      });
      const { service } = createService(bag);

      await expect(
        service.respondCancellation(actorSeller, "cr-1", { approve: false } as never),
      ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    });

    it("refuses to re-respond to a handled request", async () => {
      const bag = createPrismaMock();
      bag.prisma.cancellationRequest.findUnique.mockResolvedValue({
        id: "cr-1",
        status: "REJECTED",
        shopOrderId: "so-1",
        reason: "x",
        shopOrder: { shop: { sellerProfile: { userId: "user-seller" } } },
      });
      const { service } = createService(bag);

      await expect(
        service.respondCancellation(actorSeller, "cr-1", { approve: true } as never),
      ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    });

    it("approves a request: cancels the order and restocks", async () => {
      const bag = createPrismaMock();
      const request = {
        id: "cr-1",
        status: "PENDING",
        shopOrderId: "so-1",
        reason: "asked nicely",
        shopOrder: shopOrderFixture({ status: "CONFIRMED" }),
      };
      bag.prisma.cancellationRequest.findUnique.mockResolvedValue(request as never);
      bag.prisma.shopOrder.findUnique.mockResolvedValue(request.shopOrder as never);
      bag.prisma.shopOrder.findUniqueOrThrow.mockResolvedValue(request.shopOrder as never);
      bag.prisma.productVariant.findMany.mockResolvedValue([]);
      const { service, ledger } = createService(bag);

      const result = (await service.respondCancellation(actorSeller, "cr-1", {
        approve: true,
      } as never)) as { approved: boolean };

      expect(result).toEqual({ handled: true, approved: true });
      const updateArg = bag.prisma.cancellationRequest.update.mock.calls[0][0] as {
        data: { status: string; respondedById: string };
      };
      expect(updateArg.data.status).toBe("APPROVED");
      expect(updateArg.data.respondedById).toBe("user-seller");
      // restock happened inside the cancellation transition
      expect(bag.prisma.productVariant.update).toHaveBeenCalled();
      expect(ledger.record).not.toHaveBeenCalled();
    });

    it("rejects a request without touching the order", async () => {
      const bag = createPrismaMock();
      const request = {
        id: "cr-1",
        status: "PENDING",
        shopOrderId: "so-1",
        reason: "x",
        shopOrder: shopOrderFixture({}),
      };
      bag.prisma.cancellationRequest.findUnique.mockResolvedValue(request as never);
      const { service, ledger } = createService(bag);

      const result = (await service.respondCancellation(actorSeller, "cr-1", {
        approve: false,
      } as never)) as { approved: boolean };

      expect(result).toEqual({ handled: true, approved: false });
      expect(ledger.record).not.toHaveBeenCalled();
      expect(bag.prisma.shopOrder.update).not.toHaveBeenCalled();
    });
  });

  describe("replacements", () => {
    it("returns the existing replacement instead of creating a duplicate", async () => {
      const bag = createPrismaMock();
      const deps = createService(bag);
      bag.prisma.shopOrder.findUnique.mockResolvedValue({
        id: "so-1",
        shopOrderNumber: "SO-1",
        shopId: "shop-1",
        order: { customerId: "c-1" },
        items: [],
        shop: { id: "shop-1", sellerProfile: { userId: "u-seller" } },
      });
      bag.prisma.shopOrder.findFirst.mockResolvedValue({ id: "replacement-1", orderId: "order-2" });

      const result = await deps.service.createReplacementFromComplaint({
        parentShopOrderId: "so-1",
        complaintId: "cmp-1",
        actorId: "admin-1",
      });

      expect(result).toEqual({ orderId: "order-2", shopOrderId: "replacement-1" });
      expect(bag.prisma.$transaction).not.toHaveBeenCalled();
    });

    it("creates a zero-priced replacement with no payment and no commission", async () => {
      const bag = createPrismaMock();
      const deps = createService(bag);
      bag.prisma.shopOrder.findUnique.mockResolvedValue({
        id: "so-1",
        shopOrderNumber: "SO-1",
        shopId: "shop-1",
        order: {
          customerId: "c-1",
          contactName: "Customer",
          contactPhone: "01700000000",
          shippingDistrictId: 1,
          shippingDistrictName: "Dhaka",
          shippingArea: "Mirpur",
          shippingAddressLine: "House 1",
          shippingPostalCode: null,
          paymentMethod: "COD",
        },
        items: [
          {
            productId: "product-1",
            variantId: "variant-1",
            productName: "Plant",
            variantName: "Standard",
            imageUrl: null,
            quantity: 1,
          },
        ],
        shop: { id: "shop-1", name: "Shop", sellerProfile: { userId: "u-seller" } },
      });
      bag.prisma.shopOrder.findFirst.mockResolvedValue(null);
      bag.prisma.order.create.mockResolvedValue({ id: "order-2" });
      bag.prisma.shopOrder.create.mockResolvedValue({ id: "replacement-1" });
      bag.prisma.productVariant.findUniqueOrThrow.mockResolvedValue({ stockQty: 4 });
      bag.prisma.productVariant.findMany.mockResolvedValue([
        { price: dec(100), stockQty: 4, compareAtPrice: null },
      ]);

      await deps.service.createReplacementFromComplaint({
        parentShopOrderId: "so-1",
        complaintId: "cmp-1",
        actorId: "admin-1",
      });

      expect(bag.prisma.shopOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "REPLACEMENT",
            parentShopOrderId: "so-1",
            total: dec(0),
            commissionAmount: dec(0),
            sellerNetAmount: dec(0),
          }),
        }),
      );
      expect(bag.prisma.orderItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ unitPrice: dec(0), lineTotal: dec(0), commissionAmount: dec(0) }),
        }),
      );
      expect(bag.prisma.payment.create).not.toHaveBeenCalled();
    });
  });

  describe("stuck orders", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    function stuckService() {
      const bag = createPrismaMock();
      const deps = createService(bag);
      const getNumber = deps.settings.getNumber as unknown as {
        mockImplementation: (fn: (key: string) => Promise<number>) => void;
      };
      getNumber.mockImplementation(
        async (key) =>
          ({
            "stuck.confirmedHours": 48,
            "stuck.packedHours": 48,
            "stuck.shippedGraceDays": 2,
            "stuck.reminderHours": 24,
            "stuck.maxReminders": 3,
          })[key] ?? 48,
      );
      bag.prisma.$queryRaw.mockResolvedValue([{ locked: true }]);
      bag.prisma.user.findMany.mockResolvedValue([{ id: "admin-1" }]);
      return { bag, deps };
    }

    it("does nothing when the advisory lock is held by another instance", async () => {
      const { bag, deps } = stuckService();
      bag.prisma.$queryRaw.mockResolvedValue([{ locked: false }]);

      await deps.service.flagStuckOrders();

      expect(bag.prisma.shopOrder.findMany).not.toHaveBeenCalled();
      expect(bag.prisma.notification.create).not.toHaveBeenCalled();
    });

    it("sends one delay notice, reminds the seller and flags after max reminders", async () => {
      const { bag, deps } = stuckService();
      bag.prisma.shopOrder.findMany
        .mockResolvedValueOnce([
          { id: "so-delay", shopOrderNumber: "SO-1", order: { customerId: "c-1" } },
        ])
        .mockResolvedValueOnce([
          {
            id: "so-stuck",
            shopOrderNumber: "SO-2",
            status: "CONFIRMED",
            createdAt: new Date("2026-10-15T00:00:00.000Z"),
            confirmedAt: new Date("2026-10-15T00:00:00.000Z"),
            packedAt: null,
            shippedAt: null,
            estimatedDeliveryTo: new Date("2026-10-10T00:00:00.000Z"),
            stuckReminderCount: 0,
            stuckLastRemindedAt: null,
            stuckFlaggedAt: null,
            shop: {
              name: "Green Shop",
              sellerProfile: { userId: "u-seller", user: { email: "seller@example.com" } },
            },
          },
          {
            id: "so-flag",
            shopOrderNumber: "SO-3",
            status: "PACKED",
            createdAt: new Date("2026-10-12T00:00:00.000Z"),
            confirmedAt: new Date("2026-10-12T00:00:00.000Z"),
            packedAt: new Date("2026-10-12T00:00:00.000Z"),
            shippedAt: null,
            estimatedDeliveryTo: null,
            stuckReminderCount: 3,
            stuckLastRemindedAt: new Date("2026-10-18T00:00:00.000Z"),
            stuckFlaggedAt: null,
            shop: {
              name: "Green Shop",
              sellerProfile: { userId: "u-seller", user: { email: "seller@example.com" } },
            },
          },
        ]);

      await deps.service.flagStuckOrders();

      expect(bag.prisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: "ORDER_DELAYED", userId: "c-1" }),
        }),
      );
      expect(bag.prisma.shopOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "so-delay" },
          data: { delayNotifiedAt: new Date("2026-10-19T12:00:00.000Z") },
        }),
      );
      expect(bag.prisma.shopOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "so-stuck" },
          data: {
            stuckReminderCount: { increment: 1 },
            stuckLastRemindedAt: new Date("2026-10-19T12:00:00.000Z"),
          },
        }),
      );
      expect(bag.prisma.shopOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "so-flag" },
          data: { stuckFlaggedAt: new Date("2026-10-19T12:00:00.000Z") },
        }),
      );
      expect(deps.mail.queue).toHaveBeenCalledWith(
        expect.objectContaining({ to: "seller@example.com" }),
      );
    });

    it("does not remind again inside the 24h window (idempotent)", async () => {
      const { bag, deps } = stuckService();
      bag.prisma.shopOrder.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "so-recent",
            shopOrderNumber: "SO-4",
            status: "CONFIRMED",
            createdAt: new Date("2026-10-15T00:00:00.000Z"),
            confirmedAt: new Date("2026-10-15T00:00:00.000Z"),
            packedAt: null,
            shippedAt: null,
            estimatedDeliveryTo: null,
            stuckReminderCount: 1,
            stuckLastRemindedAt: new Date("2026-10-19T06:00:00.000Z"),
            stuckFlaggedAt: null,
            shop: {
              name: "Green Shop",
              sellerProfile: { userId: "u-seller", user: { email: "seller@example.com" } },
            },
          },
        ]);

      await deps.service.flagStuckOrders();

      expect(bag.prisma.shopOrder.update).not.toHaveBeenCalled();
      expect(deps.mail.queue).not.toHaveBeenCalled();
    });
  });

  describe("views and pagination", () => {
    it("aggregates an overall status across shop orders", async () => {
      const bag = createPrismaMock();
      bag.prisma.order.findFirst.mockResolvedValue({
        id: "o1",
        customerId: "c1",
        shopOrders: [{ status: "CANCELLED" }, { status: "DELIVERED" }],
      });
      const { service } = createService(bag);

      const result = (await service.getCustomerOrder("c1", "o1")) as { overallStatus: string };
      expect(result.overallStatus).toBe("PARTIAL");
    });

    it("throws ORDER_NOT_FOUND when reading another customer's order", async () => {
      const bag = createPrismaMock();
      bag.prisma.order.findFirst.mockResolvedValue(null);
      const { service } = createService(bag);

      await expect(service.getCustomerOrder("c1", "o1")).rejects.toMatchObject({
        code: ErrorCode.ORDER_NOT_FOUND,
      });
    });

    it("paginates the customer's order list with overall statuses", async () => {
      const bag = createPrismaMock();
      bag.prisma.order.findMany.mockResolvedValue([
        {
          id: "o1",
          customerId: "c1",
          shopOrders: [{ status: "PENDING", shopId: "s1" }],
          payments: [],
        },
      ]);
      bag.prisma.order.count.mockResolvedValue(1);
      const { service } = createService(bag);

      const result = (await service.listCustomerOrders("c1", {} as never)) as {
        data: { overallStatus: string }[];
        meta: { total: number };
      };

      expect(result.data[0].overallStatus).toBe("PENDING");
      expect(result.meta.total).toBe(1);
    });

    it("hides orders of other sellers", async () => {
      const bag = createPrismaMock();
      bag.prisma.shopOrder.findFirst.mockResolvedValue(null);
      const { service } = createService(bag);

      await expect(service.getSellerOrder("user-seller", "so-1")).rejects.toMatchObject({
        code: ErrorCode.ORDER_NOT_FOUND,
      });
    });

    it("hides unknown orders from admins too", async () => {
      const bag = createPrismaMock();
      bag.prisma.shopOrder.findUnique.mockResolvedValue(null);
      const { service } = createService(bag);

      await expect(service.getAdminOrder("nope")).rejects.toMatchObject({
        code: ErrorCode.ORDER_NOT_FOUND,
      });
    });

    it("uses the lightweight projection only when view=summary is requested", async () => {
      const bag = createPrismaMock();
      const row = {
        ...(shopOrderFixture() as unknown as Record<string, unknown>),
        order: {
          id: "order-1",
          orderNumber: "PH-1",
          customerId: "c-1",
          paymentMethod: "COD",
          paymentStatus: "PENDING",
          contactPhone: "01700000000",
        },
        items: [{ id: "item-1" }],
      };
      bag.prisma.shopOrder.findMany.mockResolvedValue([row]);
      bag.prisma.shopOrder.count.mockResolvedValue(1);
      const { service } = createService(bag);

      const result = (await service.listAdminOrders({
        view: "summary",
        page: 1,
        limit: 20,
      } as never)) as { data: unknown[]; meta: { total: number } };

      const findManyArgs = bag.prisma.shopOrder.findMany.mock.calls[0][0] as {
        select?: Record<string, unknown>;
        include?: Record<string, unknown>;
      };
      expect(findManyArgs.select).toBeDefined();
      expect(findManyArgs.include).toBeUndefined();
      expect(findManyArgs.select).not.toHaveProperty("statusHistory");
      expect(findManyArgs.select).not.toHaveProperty("payments");
      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it("keeps the full include when no summary view is requested", async () => {
      const bag = createPrismaMock();
      bag.prisma.shopOrder.findMany.mockResolvedValue([shopOrderFixture()]);
      bag.prisma.shopOrder.count.mockResolvedValue(1);
      const { service } = createService(bag);

      await service.listAdminOrders({ page: 1, limit: 20 } as never);

      const findManyArgs = bag.prisma.shopOrder.findMany.mock.calls[0][0] as {
        select?: unknown;
        include?: Record<string, unknown>;
      };
      expect(findManyArgs.include).toBeDefined();
      expect(findManyArgs.select).toBeUndefined();
      expect(findManyArgs.include).toHaveProperty("statusHistory");
    });

    it("auto-cancels stale pending orders and keeps going on failures", async () => {
      const bag = createPrismaMock();
      bag.prisma.shopOrder.findMany.mockResolvedValue([{ id: "so-1" }, { id: "so-2" }]);
      bag.prisma.shopOrder.findUnique
        .mockResolvedValueOnce(shopOrderFixture({ status: "PENDING" }))
        .mockResolvedValueOnce(null); // so-2 disappears -> warn path
      bag.prisma.shopOrder.findUniqueOrThrow.mockResolvedValue(
        shopOrderFixture({ status: "PENDING" }),
      );
      bag.prisma.productVariant.findMany.mockResolvedValue([]);
      const { service } = createService(bag);

      await expect(service.autoCancelStaleOrders()).resolves.toBeUndefined();
      expect(bag.prisma.shopOrder.findUnique).toHaveBeenCalledTimes(2);
      expect(bag.prisma.shopOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: shopOrderId },
          data: expect.objectContaining({ status: "CANCELLED" }),
        }),
      );
    });

    it("lists admin shop orders paginated", async () => {
      const bag = createPrismaMock();
      bag.prisma.shopOrder.findMany.mockResolvedValue([shopOrderFixture({}) as never]);
      bag.prisma.shopOrder.count.mockResolvedValue(1);
      const { service } = createService(bag);

      const result = (await service.listAdminOrders({} as never)) as {
        data: unknown[];
        meta: { total: number };
      };
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
