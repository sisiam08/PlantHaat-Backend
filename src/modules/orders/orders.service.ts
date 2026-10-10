import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Cron, CronExpression } from "@nestjs/schedule";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import { generateOrderNumber, toShopOrderNumber } from "../../common/utils/order-number";
import { Prisma } from "../../generated/prisma/client";
import type { OrderStatus } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import { CommissionsService } from "../commissions/commissions.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SettingsService } from "../settings/settings.service";
import { resolveDeliveryZone, type ResolvedDelivery } from "./delivery-zone.resolver";
import type { CancelOrderDto } from "./dto/cancel-order.dto";
import type {
  CancellationRequestDto,
  RespondCancellationDto,
} from "./dto/cancellation-request.dto";
import type { CheckoutDto } from "./dto/checkout.dto";
import type { QueryOrdersDto } from "./dto/query-orders.dto";
import type { TransitionOrderDto } from "./dto/transition-order.dto";
import { canTransition, type OrderActor } from "./order-state-machine";

interface LineGroup {
  shopId: string;
  sellerProfileId: string;
  sellerUserId: string;
  shopName: string;
  subtotal: Prisma.Decimal;
  delivery: ResolvedDelivery;
  lines: {
    variantId: string;
    productId: string;
    productName: string;
    variantName: string;
    imageUrl: string | null;
    unitPrice: Prisma.Decimal;
    quantity: number;
    lineTotal: Prisma.Decimal;
    commissionRate: Prisma.Decimal;
    commissionAmount: Prisma.Decimal;
  }[];
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commissions: CommissionsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  async checkout(customerId: string, dto: CheckoutDto, idempotencyKey: string | undefined) {
    if (!idempotencyKey) {
      throw AppException.badRequest(
        ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        "Idempotency-Key header is required",
      );
    }
    if (dto.paymentMethod !== "COD") {
      const onlineEnabled = await this.settings.getBoolean("payments.online.enabled");
      if (!onlineEnabled) {
        throw AppException.badRequest(
          ErrorCode.PAYMENT_METHOD_NOT_AVAILABLE,
          "Only Cash on Delivery is available",
        );
      }
    }

    const existing = await this.prisma.order.findFirst({
      where: { customerId, idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      return this.getCustomerOrder(customerId, existing.id);
    }

    const address = await this.prisma.address.findFirst({
      where: { id: dto.addressId, userId: customerId },
      include: { district: { select: { id: true, name: true } } },
    });
    if (!address) {
      throw AppException.notFound(ErrorCode.ADDRESS_NOT_FOUND, "Address not found");
    }

    const cart = await this.prisma.cart.findUnique({
      where: { userId: customerId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    category: { select: { id: true, parentId: true } },
                    shop: {
                      include: {
                        sellerProfile: { select: { id: true, userId: true, status: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw AppException.unprocessable(ErrorCode.CART_EMPTY, "Your cart is empty");
    }

    const problems: { variantId: string; code: string; available?: number }[] = [];
    const groups = new Map<string, LineGroup>();

    for (const item of cart.items) {
      const variant = item.variant;
      const product = variant.product;
      const shop = product.shop;
      const seller = shop.sellerProfile;

      if (product.status !== "ACTIVE" || product.deletedAt) {
        problems.push({ variantId: variant.id, code: "PRODUCT_UNAVAILABLE" });
        continue;
      }
      if (!variant.isActive) {
        problems.push({ variantId: variant.id, code: "VARIANT_UNAVAILABLE" });
        continue;
      }
      if (shop.status !== "ACTIVE" || seller.status !== "APPROVED") {
        problems.push({ variantId: variant.id, code: "SHOP_UNAVAILABLE" });
        continue;
      }
      if (shop.isOnVacation) {
        problems.push({ variantId: variant.id, code: "SHOP_ON_VACATION" });
        continue;
      }
      if (variant.stockQty < item.quantity) {
        problems.push({
          variantId: variant.id,
          code: "INSUFFICIENT_STOCK",
          available: variant.stockQty,
        });
        continue;
      }
      groups.set(
        shop.id,
        groups.get(shop.id) ?? {
          shopId: shop.id,
          sellerProfileId: seller.id,
          sellerUserId: seller.userId,
          shopName: shop.name,
          subtotal: new Prisma.Decimal(0),
          delivery: {
            zoneId: "",
            charge: new Prisma.Decimal(0),
            freeDeliveryAbove: null,
            estimatedDaysMin: 1,
            estimatedDaysMax: 3,
          },
          lines: [],
        },
      );
      const group = groups.get(shop.id)!;
      const lineTotal = variant.price.mul(item.quantity);
      const rate = await this.commissions.resolveRatePercent({
        sellerProfileId: seller.id,
        categoryId: product.category.id,
        parentCategoryId: product.category.parentId,
      });
      const commissionAmount = lineTotal.mul(rate).div(100).toDecimalPlaces(2);
      group.lines.push({
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        variantName: variant.name,
        imageUrl: null,
        unitPrice: variant.price,
        quantity: item.quantity,
        lineTotal,
        commissionRate: rate,
        commissionAmount,
      });
      group.subtotal = group.subtotal.plus(lineTotal);
    }

    for (const group of groups.values()) {
      const zone = await resolveDeliveryZone(this.prisma, group.shopId, address.districtId);
      if (!zone) {
        problems.push({
          variantId: group.lines[0]?.variantId ?? "",
          code: "SHOP_NOT_DELIVERING_TO_DISTRICT",
        });
        continue;
      }
      group.delivery = zone;
    }

    if (problems.length > 0) {
      throw AppException.unprocessable(
        ErrorCode.CHECKOUT_VALIDATION_FAILED,
        "Some items could not be checked out",
        problems,
      );
    }

    const shopGroups = [...groups.values()];
    if (shopGroups.length === 0) {
      throw AppException.unprocessable(ErrorCode.CART_EMPTY, "Your cart is empty");
    }

    const orderId = await this.createOrderTransaction({
      customerId,
      address,
      dto,
      idempotencyKey,
      cartId: cart.id,
      groups: shopGroups,
    });

    this.events.emit("order.placed", {
      orderId,
      customerId,
      sellerUserIds: [...new Set(shopGroups.map((g) => g.sellerUserId))],
    });

    return this.getCustomerOrder(customerId, orderId);
  }

  private async createOrderTransaction(params: {
    customerId: string;
    address: {
      recipientName: string;
      phone: string;
      districtId: number;
      district: { name: string };
      area: string;
      addressLine: string;
      postalCode: string | null;
    };
    dto: CheckoutDto;
    idempotencyKey: string;
    cartId: string;
    groups: LineGroup[];
  }): Promise<string> {
    const { customerId, address, dto, idempotencyKey, cartId, groups } = params;

    const subtotal = groups.reduce((sum, g) => sum.plus(g.subtotal), new Prisma.Decimal(0));
    const deliveryTotal = groups.reduce((sum, g) => {
      const free =
        g.delivery.freeDeliveryAbove !== null && g.subtotal.gte(g.delivery.freeDeliveryAbove);
      return sum.plus(free ? new Prisma.Decimal(0) : g.delivery.charge);
    }, new Prisma.Decimal(0));

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const orderNumber = generateOrderNumber();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const order = await tx.order.create({
            data: {
              orderNumber,
              customerId,
              idempotencyKey,
              contactName: address.recipientName,
              contactPhone: address.phone,
              shippingDistrictId: address.districtId,
              shippingDistrictName: address.district.name,
              shippingArea: address.area,
              shippingAddressLine: address.addressLine,
              shippingPostalCode: address.postalCode,
              deliveryNote: dto.note ?? null,
              paymentMethod: dto.paymentMethod,
              paymentStatus: "PENDING",
              subtotal,
              deliveryTotal,
              discountTotal: new Prisma.Decimal(0),
              grandTotal: subtotal.plus(deliveryTotal),
            },
          });

          let index = 1;
          for (const group of groups) {
            const free =
              group.delivery.freeDeliveryAbove !== null &&
              group.subtotal.gte(group.delivery.freeDeliveryAbove);
            const deliveryCharge = free ? new Prisma.Decimal(0) : group.delivery.charge;
            const commissionAmount = group.lines
              .reduce((sum, l) => sum.plus(l.commissionAmount), new Prisma.Decimal(0))
              .toDecimalPlaces(2);
            const total = group.subtotal.plus(deliveryCharge);
            const shopOrderNumber = toShopOrderNumber(orderNumber, index);
            index += 1;

            const shopOrder = await tx.shopOrder.create({
              data: {
                shopOrderNumber,
                orderId: order.id,
                shopId: group.shopId,
                status: "PENDING",
                subtotal: group.subtotal,
                deliveryCharge,
                total,
                commissionAmount,
                sellerNetAmount: total.minus(commissionAmount),
                estimatedDeliveryFrom: addDays(new Date(), group.delivery.estimatedDaysMin),
                estimatedDeliveryTo: addDays(new Date(), group.delivery.estimatedDaysMax),
              },
            });

            for (const line of group.lines) {
              await tx.orderItem.create({
                data: {
                  shopOrderId: shopOrder.id,
                  productId: line.productId,
                  variantId: line.variantId,
                  productName: line.productName,
                  variantName: line.variantName,
                  imageUrl: line.imageUrl,
                  unitPrice: line.unitPrice,
                  quantity: line.quantity,
                  lineTotal: line.lineTotal,
                  commissionRate: line.commissionRate,
                  commissionAmount: line.commissionAmount,
                },
              });

              const decremented = await tx.productVariant.updateMany({
                where: { id: line.variantId, stockQty: { gte: line.quantity } },
                data: { stockQty: { decrement: line.quantity } },
              });
              if (decremented.count === 0) {
                throw AppException.unprocessable(
                  ErrorCode.INSUFFICIENT_STOCK,
                  "An item sold out while you were checking out",
                );
              }
              const updated = await tx.productVariant.findUniqueOrThrow({
                where: { id: line.variantId },
                select: { stockQty: true },
              });
              await tx.inventoryLog.create({
                data: {
                  variantId: line.variantId,
                  delta: -line.quantity,
                  stockAfter: updated.stockQty,
                  reason: "ORDER_PLACED",
                  referenceType: "Order",
                  referenceId: order.id,
                },
              });
              await recomputeProduct(tx, line.productId);
            }

            await tx.orderStatusHistory.create({
              data: {
                shopOrderId: shopOrder.id,
                toStatus: "PENDING",
              },
            });

            await tx.payment.create({
              data: {
                orderId: order.id,
                shopOrderId: shopOrder.id,
                method: dto.paymentMethod,
                status: "PENDING",
                amount: total,
              },
            });
          }

          await tx.cartItem.deleteMany({
            where: {
              cartId,
              variantId: { in: groups.flatMap((g) => g.lines.map((l) => l.variantId)) },
            },
          });

          return order.id;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const meta = error.meta as { target?: unknown } | undefined;
          const target = JSON.stringify(meta?.target ?? "");
          if (target.includes("idempotencyKey")) {
            const found = await this.prisma.order.findFirst({
              where: { customerId, idempotencyKey },
              select: { id: true },
            });
            if (found) {
              return found.id;
            }
          }
          if (target.includes("orderNumber") || target.includes("shopOrderNumber")) {
            continue;
          }
        }
        throw error;
      }
    }
    throw AppException.internal("Could not allocate an order number");
  }

  async listCustomerOrders(
    customerId: string,
    query: QueryOrdersDto,
  ): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      orderBy: { placedAt: "desc" },
      skip,
      take: limit,
      include: { shopOrders: { select: { status: true, shopId: true } }, payments: true },
    });
    const total = await this.prisma.order.count({ where: { customerId } });
    const data = orders.map((order) => this.withOverallStatus(order));
    return paginate(data, total, page, limit);
  }

  async getCustomerOrder(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) {
      throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    }
    return this.withOverallStatus(order);
  }

  async listSellerOrders(
    sellerUserId: string,
    query: QueryOrdersDto,
  ): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.ShopOrderWhereInput = {
      shop: { sellerProfile: { userId: sellerUserId } },
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shopOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: SHOP_ORDER_INCLUDE,
      }),
      this.prisma.shopOrder.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async getSellerOrder(sellerUserId: string, shopOrderId: string) {
    return this.getOwnedShopOrder(sellerUserId, shopOrderId);
  }

  async transitionBySeller(sellerUserId: string, shopOrderId: string, dto: TransitionOrderDto) {
    return this.transition(sellerUserId, "SELLER", shopOrderId, dto);
  }

  async transitionByAdmin(shopOrderId: string, dto: TransitionOrderDto) {
    return this.transition(null, "ADMIN", shopOrderId, dto);
  }

  async cancelByCustomer(customerId: string, shopOrderId: string, dto: CancelOrderDto) {
    const shopOrder = await this.prisma.shopOrder.findFirst({
      where: { id: shopOrderId, order: { customerId } },
      select: { id: true, status: true },
    });
    if (!shopOrder) {
      throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    }
    return this.transition(customerId, "CUSTOMER", shopOrderId, {
      status: "CANCELLED",
      note: dto.reason,
    });
  }

  async createCancellationRequest(
    customerId: string,
    shopOrderId: string,
    dto: CancellationRequestDto,
  ) {
    const shopOrder = await this.prisma.shopOrder.findFirst({
      where: { id: shopOrderId, order: { customerId }, status: { in: ["CONFIRMED", "PACKED"] } },
      select: { id: true },
    });
    if (!shopOrder) {
      throw AppException.badRequest(
        ErrorCode.CANCELLATION_NOT_ALLOWED,
        "This order can no longer be cancelled here",
      );
    }
    const pending = await this.prisma.cancellationRequest.findFirst({
      where: { shopOrderId, status: "PENDING" },
      select: { id: true },
    });
    if (pending) {
      throw AppException.conflict(
        ErrorCode.CANCELLATION_REQUEST_PENDING,
        "A cancellation request is already pending",
      );
    }
    return this.prisma.cancellationRequest.create({
      data: { shopOrderId, requestedById: customerId, reason: dto.reason },
    });
  }

  async respondCancellation(
    actor: AuthenticatedUser,
    requestId: string,
    dto: RespondCancellationDto,
  ) {
    const request = await this.prisma.cancellationRequest.findUnique({
      where: { id: requestId },
      include: { shopOrder: { include: { shop: { include: { sellerProfile: true } } } } },
    });
    if (!request) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Cancellation request not found");
    }
    if (actor.role === "SELLER" && request.shopOrder.shop.sellerProfile.userId !== actor.id) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Cancellation request not found");
    }
    if (request.status !== "PENDING") {
      throw AppException.conflict(ErrorCode.CONFLICT, "This request has already been handled");
    }

    await this.prisma.cancellationRequest.update({
      where: { id: requestId },
      data: {
        status: dto.approve ? "APPROVED" : "REJECTED",
        respondedById: actor.id,
        responseNote: dto.note ?? null,
        respondedAt: new Date(),
      },
    });

    if (dto.approve) {
      await this.transition(
        null,
        actor.role === "ADMIN" ? "ADMIN" : "SELLER",
        request.shopOrderId,
        {
          status: "CANCELLED",
          note: `Cancellation request approved: ${dto.note ?? request.reason}`,
          restock: true,
        },
      );
    }
    return { handled: true, approved: dto.approve };
  }

  async listSellerCancellationRequests(
    sellerUserId: string,
    query: QueryOrdersDto,
  ): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.CancellationRequestWhereInput = {
      shopOrder: { shop: { sellerProfile: { userId: sellerUserId } } },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cancellationRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          shopOrder: { select: { id: true, shopOrderNumber: true, status: true, total: true } },
        },
      }),
      this.prisma.cancellationRequest.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async autoCancelStaleOrders(): Promise<void> {
    const timeoutHours = await this.settings.getNumber("order.sellerConfirmTimeoutHours");
    const cutoff = new Date(Date.now() - timeoutHours * 60 * 60 * 1000);
    const stale = await this.prisma.shopOrder.findMany({
      where: { status: "PENDING", createdAt: { lt: cutoff } },
      select: { id: true },
    });
    for (const shopOrder of stale) {
      try {
        await this.transition(null, "SYSTEM", shopOrder.id, {
          status: "CANCELLED",
          note: "Automatically cancelled: seller did not confirm in time",
          restock: true,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to auto-cancel ${shopOrder.id}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }
  }

  private async transition(
    actorId: string | null,
    actorRole: OrderActor,
    shopOrderId: string,
    dto: TransitionOrderDto,
  ) {
    const shopOrder = await this.prisma.shopOrder.findUnique({
      where: { id: shopOrderId },
      include: {
        items: true,
        payments: true,
        order: { select: { id: true, customerId: true } },
        shop: { include: { sellerProfile: { select: { userId: true } } } },
      },
    });
    if (!shopOrder) {
      throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    }
    if (actorRole === "SELLER" && shopOrder.shop.sellerProfile.userId !== actorId) {
      throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    }

    const from = shopOrder.status;
    const to = dto.status;
    if (!canTransition(from, to, actorRole)) {
      throw AppException.badRequest(
        ErrorCode.INVALID_STATUS_TRANSITION,
        `Cannot change status from ${from} to ${to}`,
      );
    }

    const cancelling = to === "CANCELLED";
    const restock = cancelling && shouldRestock(from, dto.restock);

    await this.prisma.$transaction(async (tx) => {
      await tx.shopOrder.update({
        where: { id: shopOrderId },
        data: {
          status: to,
          ...timestampFor(to),
          ...(dto.note !== undefined ? { sellerNote: dto.note } : {}),
          ...(to === "SHIPPED"
            ? {
                courierName: dto.courierName ?? shopOrder.courierName,
                trackingCode: dto.trackingCode ?? shopOrder.trackingCode,
                estimatedDeliveryFrom: dto.estimatedDeliveryFrom
                  ? new Date(dto.estimatedDeliveryFrom)
                  : shopOrder.estimatedDeliveryFrom,
                estimatedDeliveryTo: dto.estimatedDeliveryTo
                  ? new Date(dto.estimatedDeliveryTo)
                  : shopOrder.estimatedDeliveryTo,
              }
            : {}),
          ...(cancelling
            ? {
                cancelledBy: actorRole === "SYSTEM" ? "SYSTEM" : actorRole,
                cancelReason: dto.note ?? null,
              }
            : {}),
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          shopOrderId,
          fromStatus: from,
          toStatus: to,
          changedById: actorId,
          changedByRole: actorRole === "SYSTEM" ? "ADMIN" : actorRole,
          note: dto.note ?? null,
        },
      });

      if (restock) {
        for (const item of shopOrder.items) {
          if (!item.variantId) continue;
          const restored = await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQty: { increment: item.quantity } },
            select: { stockQty: true },
          });
          await tx.inventoryLog.create({
            data: {
              variantId: item.variantId,
              delta: item.quantity,
              stockAfter: restored.stockQty,
              reason: "ORDER_CANCELLED",
              referenceType: "ShopOrder",
              referenceId: shopOrderId,
              createdById: actorId,
            },
          });
          if (item.productId) {
            await recomputeProduct(tx, item.productId);
          }
        }
      }

      if (cancelling) {
        await tx.payment.updateMany({
          where: { shopOrderId, status: { in: ["PENDING", "FAILED"] } },
          data: { status: "CANCELLED" },
        });
      }

      if (to === "DELIVERED") {
        await tx.payment.updateMany({
          where: { shopOrderId, method: "COD", status: "PENDING" },
          data: { status: "PAID", paidAt: new Date() },
        });
        for (const item of shopOrder.items) {
          if (item.productId) {
            await tx.product.update({
              where: { id: item.productId },
              data: { soldCount: { increment: item.quantity } },
            });
          }
        }
        await this.recomputeOrderPaymentStatus(tx, shopOrder.order.id);
      }
    });

    this.events.emit("order.status_changed", {
      shopOrderId,
      orderId: shopOrder.order.id,
      customerId: shopOrder.order.customerId,
      sellerUserId: shopOrder.shop.sellerProfile.userId,
      status: to,
    });

    return this.prisma.shopOrder.findUniqueOrThrow({
      where: { id: shopOrderId },
      include: SHOP_ORDER_INCLUDE,
    });
  }

  private async recomputeOrderPaymentStatus(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const payments = await tx.payment.findMany({
      where: { orderId },
      select: { status: true },
    });
    const allPaid = payments.length > 0 && payments.every((p) => p.status === "PAID");
    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: allPaid ? "PAID" : "PENDING" },
    });
  }

  private async getOwnedShopOrder(sellerUserId: string, shopOrderId: string) {
    const shopOrder = await this.prisma.shopOrder.findFirst({
      where: { id: shopOrderId, shop: { sellerProfile: { userId: sellerUserId } } },
      include: SHOP_ORDER_INCLUDE,
    });
    if (!shopOrder) {
      throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    }
    return shopOrder;
  }

  async listAdminOrders(query: QueryOrdersDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.ShopOrderWhereInput = query.status ? { status: query.status } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shopOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: SHOP_ORDER_INCLUDE,
      }),
      this.prisma.shopOrder.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async getAdminOrder(shopOrderId: string) {
    const shopOrder = await this.prisma.shopOrder.findUnique({
      where: { id: shopOrderId },
      include: SHOP_ORDER_INCLUDE,
    });
    if (!shopOrder) {
      throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    }
    return shopOrder;
  }

  private withOverallStatus<T extends { shopOrders: { status: OrderStatus }[] }>(
    order: T,
  ): T & { overallStatus: string } {
    return { ...order, overallStatus: computeOverallStatus(order.shopOrders.map((s) => s.status)) };
  }
}

const SHOP_ORDER_INCLUDE = {
  items: true,
  statusHistory: { orderBy: { createdAt: "asc" } },
  payments: true,
  shop: { select: { id: true, name: true, slug: true } },
  order: { select: { id: true, orderNumber: true, customerId: true, paymentMethod: true } },
} satisfies Prisma.ShopOrderInclude;

const ORDER_DETAIL_INCLUDE = {
  shopOrders: {
    include: {
      items: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
      payments: true,
      shop: { select: { id: true, name: true, slug: true } },
    },
  },
  payments: true,
} satisfies Prisma.OrderInclude;

function timestampFor(status: OrderStatus): Prisma.ShopOrderUpdateInput {
  switch (status) {
    case "CONFIRMED":
      return { confirmedAt: new Date() };
    case "PACKED":
      return { packedAt: new Date() };
    case "SHIPPED":
      return { shippedAt: new Date() };
    case "DELIVERED":
      return { deliveredAt: new Date() };
    case "CANCELLED":
      return { cancelledAt: new Date() };
    default:
      return {};
  }
}

function shouldRestock(from: OrderStatus, requested: boolean | undefined): boolean {
  if (from === "PENDING" || from === "CONFIRMED" || from === "PACKED") {
    return true;
  }
  return requested === true;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function recomputeProduct(tx: Prisma.TransactionClient, productId: string): Promise<void> {
  const variants = await tx.productVariant.findMany({
    where: { productId, isActive: true },
    select: { price: true, stockQty: true },
  });
  if (variants.length === 0) {
    await tx.product.update({
      where: { id: productId },
      data: { minPrice: null, maxPrice: null, inStock: false },
    });
    return;
  }
  let min = variants[0].price;
  let max = variants[0].price;
  let inStock = false;
  for (const variant of variants) {
    if (variant.price.lessThan(min)) min = variant.price;
    if (variant.price.greaterThan(max)) max = variant.price;
    if (variant.stockQty > 0) inStock = true;
  }
  await tx.product.update({
    where: { id: productId },
    data: { minPrice: min, maxPrice: max, inStock },
  });
}

function computeOverallStatus(statuses: OrderStatus[]): string {
  if (statuses.length === 0) return "PENDING";
  if (statuses.every((s) => s === "DELIVERED")) return "DELIVERED";
  if (statuses.every((s) => s === "CANCELLED")) return "CANCELLED";
  if (statuses.some((s) => s === "CANCELLED")) return "PARTIAL";
  const order: OrderStatus[] = [
    "PENDING",
    "CONFIRMED",
    "PACKED",
    "SHIPPED",
    "FAILED_DELIVERY",
    "DELIVERED",
  ];
  let least = statuses[0];
  for (const status of statuses) {
    if (order.indexOf(status) < order.indexOf(least)) {
      least = status;
    }
  }
  return least;
}
