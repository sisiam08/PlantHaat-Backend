import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Cron, CronExpression } from "@nestjs/schedule";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import {
  lineCommission,
  lineTotal as computeLineTotal,
  money,
  sumMoney,
} from "../../common/utils/money";
import { generateOrderNumber, toShopOrderNumber } from "../../common/utils/order-number";
import { Prisma } from "../../generated/prisma/client";
import type { CodRiskStatus, OrderStatus } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import { CodRiskService } from "../cod-risk/cod-risk.service";
import { CommissionsService } from "../commissions/commissions.service";
import { LedgerService } from "../ledger/ledger.service";
import { MailService } from "../mail/mail.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PaymentsService } from "../payments/payments.service";
import {
  DeliveryQuoteService,
  type DeliveryQuoteLine,
  type ShopDeliveryQuote,
} from "../delivery-quote/delivery-quote.service";
import { recomputeProductAggregates } from "../products/product-aggregates";
import { SettingsService } from "../settings/settings.service";
import { UploadsService } from "../uploads/uploads.service";
import { resolveDeliveryCondition, type ResolvedDeliveryCondition } from "./delivery-condition.resolver";
import type { CancelOrderDto } from "./dto/cancel-order.dto";
import type {
  CancellationRequestDto,
  RespondCancellationDto,
} from "./dto/cancellation-request.dto";
import type { CheckoutDto } from "./dto/checkout.dto";
import type { QueryOrdersDto } from "./dto/query-orders.dto";
import type { QueryStuckOrdersDto } from "./dto/query-stuck-orders.dto";
import type { TransitionOrderDto } from "./dto/transition-order.dto";
import { canTransition, type OrderActor } from "./order-state-machine";

interface LineGroup {
  shopId: string;
  sellerProfileId: string;
  sellerUserId: string;
  shopName: string;
  subtotal: Prisma.Decimal;
  delivery: ResolvedDeliveryCondition;
  quote: ShopDeliveryQuote | null;
  quoteLines: DeliveryQuoteLine[];
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
    private readonly ledger: LedgerService,
    private readonly events: EventEmitter2,
    private readonly mail: MailService,
    private readonly codRisk: CodRiskService,
    private readonly payments: PaymentsService,
    private readonly uploads: UploadsService,
    private readonly deliveryQuote: DeliveryQuoteService,
  ) {}

  async checkout(customerId: string, dto: CheckoutDto, idempotencyKey: string | undefined) {
    if (!idempotencyKey) {
      throw AppException.badRequest(
        ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        "Idempotency-Key header is required",
      );
    }
    if (dto.paymentMethod === "ADVANCE") {
      if (!(await this.settings.getEffectiveAdvance())) {
        throw AppException.badRequest(
          ErrorCode.PAYMENT_METHOD_NOT_AVAILABLE,
          "Advance payment is not available",
        );
      }
    } else if (dto.paymentMethod !== "COD") {
      throw AppException.badRequest(
        ErrorCode.PAYMENT_METHOD_NOT_AVAILABLE,
        "Only Cash on Delivery and Advance payment are available",
      );
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
      include: {
        district: { select: { id: true, name: true, insideDhaka: true } },
        thana: { select: { id: true, name: true, dhakaZone: true } },
      },
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

    const problems: {
      variantId: string;
      code: string;
      available?: number;
      reason?: string;
    }[] = [];
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
            name: "",
            charge: new Prisma.Decimal(0),
            freeDeliveryAbove: null,
            estimatedDaysMin: 1,
            estimatedDaysMax: 3,
            condition: address.district.insideDhaka ? "INSIDE_DHAKA" : "OUTSIDE_DHAKA",
            paymentMode: "COD_AND_ADVANCE",
            freeDeliveryEnabled: false,
          },
          quote: null,
          quoteLines: [],
          lines: [],
        },
      );
      const group = groups.get(shop.id)!;
      const lineTotal = computeLineTotal(variant.price, item.quantity);
      const rate = await this.commissions.resolveRatePercent({
        sellerProfileId: seller.id,
        categoryId: product.category.id,
        parentCategoryId: product.category.parentId,
      });
      const commissionAmount = lineCommission(lineTotal, rate);
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
      group.quoteLines.push({
        weightKg: product.weightKg,
        quantity: item.quantity,
        extraChargeAfterQty: product.extraChargeAfterQty,
        extraChargePerUnit: product.extraChargePerUnit,
      });
    }

    for (const group of groups.values()) {
      const delivery = await resolveDeliveryCondition(
        this.prisma,
        group.shopId,
        address.districtId,
        address.district.insideDhaka,
      );
      if (!delivery) {
        problems.push({
          variantId: group.lines[0]?.variantId ?? "",
          code: "SHOP_NOT_DELIVERING_TO_DISTRICT",
        });
        continue;
      }
      group.delivery = delivery;
      const quote = await this.deliveryQuote.quoteShop({
        shopId: group.shopId,
        districtId: address.districtId,
        thanaId: address.thanaId,
        lines: group.quoteLines,
        subtotal: group.subtotal,
        freeDeliveryEnabled: delivery.freeDeliveryEnabled,
        freeDeliveryAbove: delivery.freeDeliveryAbove,
      });
      if (!quote.available) {
        problems.push({
          variantId: group.lines[0]?.variantId ?? "",
          code: ErrorCode.DELIVERY_QUOTE_UNAVAILABLE,
          reason: quote.reason ?? "ROUTE_UNAVAILABLE",
        });
        continue;
      }
      group.quote = quote;
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

    const blocked = shopGroups.filter((group) => {
      if (dto.paymentMethod === "COD") return group.delivery.paymentMode === "ADVANCE_ONLY";
      return group.delivery.paymentMode === "COD_ONLY";
    });
    if (blocked.length > 0) {
      throw AppException.badRequest(
        ErrorCode.PAYMENT_METHOD_NOT_AVAILABLE,
        "The selected payment method is not available for one or more shops",
        {
          shops: blocked.map((group) => ({
            shopId: group.shopId,
            condition: group.delivery.condition,
            paymentMode: group.delivery.paymentMode,
          })),
        },
      );
    }

    const totals = cartTotals(shopGroups);

    if (
      dto.expectedDeliveryTotal !== undefined &&
      !totals.deliveryTotal.equals(new Prisma.Decimal(dto.expectedDeliveryTotal))
    ) {
      throw AppException.conflict(
        ErrorCode.DELIVERY_CHARGE_CHANGED,
        "The delivery charge changed since you last saw your cart",
        {
          expectedDeliveryTotal: new Prisma.Decimal(
            dto.expectedDeliveryTotal,
          ).toString(),
          deliveryTotal: totals.deliveryTotal.toString(),
          grandTotal: totals.grandTotal.toString(),
          shops: shopGroups.map((group) => ({
            shopId: group.shopId,
            deliveryCharge: group.quote?.total.toString() ?? "0",
            courierCharge: group.quote?.courierCharge?.toString() ?? null,
            sellerExtraCharge: group.quote?.extraCharge.toString() ?? "0",
            freeDeliveryApplied: group.quote?.freeDeliveryApplied ?? false,
            source: group.quote?.source ?? null,
            reason: group.quote?.reason ?? null,
          })),
        },
      );
    }

    if (dto.paymentMethod === "COD") {
      const codEnabled = await this.settings.getBoolean("payment.cod.enabled");
      if (!codEnabled) {
        throw AppException.badRequest(
          ErrorCode.PAYMENT_METHOD_NOT_AVAILABLE,
          "Cash on delivery is currently unavailable",
        );
      }
      const codMax = await this.settings.getNumber("order.codMaxAmount");
      if (codMax > 0 && totals.grandTotal.gt(codMax)) {
        throw AppException.badRequest(
          ErrorCode.PAYMENT_METHOD_NOT_AVAILABLE,
          `Cash on delivery is available for orders up to ${codMax}`,
        );
      }

      const account = await this.prisma.user.findUnique({
        where: { id: customerId },
        select: { phone: true },
      });
      const assessment = await this.codRisk.assess({
        shippingPhone: address.phone,
        accountPhone: account?.phone ?? null,
        addressFingerprint: this.codRisk.fingerprint(address),
        codTotal: totals.grandTotal,
      });
      if (assessment.status === "BLOCKED") {
        throw AppException.unprocessable(
          ErrorCode.COD_BLOCKED,
          "Cash on delivery is unavailable for this phone. Please contact support.",
          { status: assessment.status },
        );
      }
      if (assessment.capExceeded) {
        const cap = await this.settings.getNumber("codRisk.restrictCap");
        throw AppException.unprocessable(
          ErrorCode.COD_RESTRICTED,
          "Cash on delivery is limited to ? for this phone. Please contact support.",
          { status: assessment.status, limit: cap, grandTotal: totals.grandTotal.toString() },
        );
      }
    }
    if (
      dto.expectedGrandTotal !== undefined &&
      !totals.grandTotal.equals(new Prisma.Decimal(dto.expectedGrandTotal))
    ) {
      const changedLines = cart.items
        .filter(
          (item) =>
            item.priceSnapshot != null && !item.priceSnapshot.equals(item.variant.price),
        )
        .map((item) => ({
          variantId: item.variantId,
          productId: item.variant.product.id,
          productName: item.variant.product.name,
          variantName: item.variant.name,
          slug: item.variant.product.slug,
          from: item.priceSnapshot!.toString(),
          to: item.variant.price.toString(),
        }));
      throw AppException.conflict(
        ErrorCode.PRICE_CHANGED,
        "Some prices changed since you last saw your cart",
        {
          expectedGrandTotal: new Prisma.Decimal(dto.expectedGrandTotal).toString(),
          subtotal: totals.subtotal.toString(),
          deliveryTotal: totals.deliveryTotal.toString(),
          grandTotal: totals.grandTotal.toString(),
          changedLines,
        },
      );
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

  /**
   * Create the free replacement shop order for a complaint resolved as
   * RESOLVED_REPLACEMENT. Idempotent: a parent can have at most one replacement
   * (enforced by a unique index on parentShopOrderId).
   */
  async createReplacementFromComplaint(input: {
    parentShopOrderId: string;
    complaintId: string;
    actorId: string | null;
  }): Promise<{ orderId: string; shopOrderId: string }> {
    const parent = await this.prisma.shopOrder.findUnique({
      where: { id: input.parentShopOrderId },
      include: {
        order: true,
        items: { orderBy: { createdAt: "asc" } },
        shop: {
          select: {
            id: true,
            name: true,
            sellerProfile: { select: { userId: true } },
          },
        },
      },
    });
    if (!parent) {
      throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    }

    const existing = await this.findReplacement(parent.id);
    if (existing) {
      return existing;
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const orderNumber = generateOrderNumber();
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const order = await tx.order.create({
            data: {
              orderNumber,
              customerId: parent.order.customerId,
              idempotencyKey: null,
              contactName: parent.order.contactName,
              contactPhone: parent.order.contactPhone,
              shippingDistrictId: parent.order.shippingDistrictId,
              shippingDistrictName: parent.order.shippingDistrictName,
              shippingArea: parent.order.shippingArea,
              shippingAddressLine: parent.order.shippingAddressLine,
              shippingPostalCode: parent.order.shippingPostalCode,
              deliveryNote: `Replacement for ${parent.shopOrderNumber}`,
              paymentMethod: parent.order.paymentMethod,
              // Nothing is due for a replacement.
              paymentStatus: "PAID",
              subtotal: new Prisma.Decimal(0),
              deliveryTotal: new Prisma.Decimal(0),
              discountTotal: new Prisma.Decimal(0),
              grandTotal: new Prisma.Decimal(0),
            },
          });

          const shopOrder = await tx.shopOrder.create({
            data: {
              shopOrderNumber: toShopOrderNumber(orderNumber, 1),
              orderId: order.id,
              shopId: parent.shopId,
              kind: "REPLACEMENT",
              parentShopOrderId: parent.id,
              status: "PENDING",
              subtotal: new Prisma.Decimal(0),
              deliveryCharge: new Prisma.Decimal(0),
              total: new Prisma.Decimal(0),
              commissionAmount: new Prisma.Decimal(0),
              sellerNetAmount: new Prisma.Decimal(0),
              estimatedDeliveryFrom: addDays(new Date(), 1),
              estimatedDeliveryTo: addDays(new Date(), 3),
            },
          });

          for (const item of parent.items) {
            await tx.orderItem.create({
              data: {
                shopOrderId: shopOrder.id,
                productId: item.productId,
                variantId: item.variantId,
                productName: item.productName,
                variantName: item.variantName,
                imageUrl: item.imageUrl,
                unitPrice: new Prisma.Decimal(0),
                quantity: item.quantity,
                lineTotal: new Prisma.Decimal(0),
                commissionRate: new Prisma.Decimal(0),
                commissionAmount: new Prisma.Decimal(0),
              },
            });

            if (!item.variantId) {
              continue;
            }
            const decremented = await tx.productVariant.updateMany({
              where: { id: item.variantId, stockQty: { gte: item.quantity } },
              data: { stockQty: { decrement: item.quantity } },
            });
            if (decremented.count === 0) {
              throw AppException.unprocessable(
                ErrorCode.INSUFFICIENT_STOCK,
                "A replacement item is out of stock",
              );
            }
            const updated = await tx.productVariant.findUniqueOrThrow({
              where: { id: item.variantId },
              select: { stockQty: true },
            });
            await tx.inventoryLog.create({
              data: {
                variantId: item.variantId,
                delta: -item.quantity,
                stockAfter: updated.stockQty,
                reason: "ORDER_PLACED",
                referenceType: "ShopOrder",
                referenceId: shopOrder.id,
                createdById: input.actorId,
              },
            });
            if (item.productId) {
              await recomputeProductAggregates(tx, item.productId);
            }
          }

      await tx.orderStatusHistory.create({
            data: {
              shopOrderId: shopOrder.id,
              toStatus: "PENDING",
              changedById: input.actorId,
              changedByRole: "ADMIN",
              note: `Replacement for ${parent.shopOrderNumber}`,
            },
          });

          return { orderId: order.id, shopOrderId: shopOrder.id };
        });

        await this.notifications.create({
          userId: parent.order.customerId,
          type: "REPLACEMENT_CREATED",
          title: "Replacement order created",
          body: `A free replacement for ${parent.shopOrderNumber} has been created.`,
          data: {
            orderId: created.orderId,
            shopOrderId: created.shopOrderId,
            parentShopOrderId: parent.id,
            complaintId: input.complaintId,
          },
        });
        await this.notifications.create({
          userId: parent.shop.sellerProfile.userId,
          type: "REPLACEMENT_CREATED",
          title: "Replacement order created",
          body: `A free replacement for ${parent.shopOrderNumber} needs to be fulfilled.`,
          data: {
            orderId: created.orderId,
            shopOrderId: created.shopOrderId,
            parentShopOrderId: parent.id,
            complaintId: input.complaintId,
          },
        });

        return created;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const found = await this.findReplacement(parent.id);
          if (found) {
            return found;
          }
          continue;
        }
        throw error;
      }
    }
    throw AppException.internal("Could not allocate a replacement order number");
  }

  private async findReplacement(
    parentShopOrderId: string,
  ): Promise<{ orderId: string; shopOrderId: string } | null> {
    const replacement = await this.prisma.shopOrder.findFirst({
      where: { parentShopOrderId, kind: "REPLACEMENT" },
      select: { id: true, orderId: true },
    });
    return replacement ? { orderId: replacement.orderId, shopOrderId: replacement.id } : null;
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

    const { subtotal, deliveryTotal, grandTotal } = cartTotals(groups);
    const advanceSnapshot =
      dto.paymentMethod === "ADVANCE" ? await this.payments.snapshot() : null;

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
              grandTotal,
            },
          });

          const allocations: { shopOrderId: string; amount: Prisma.Decimal }[] = [];
          let index = 1;
          for (const group of groups) {
            const quote = group.quote!;
            const deliveryCharge = quote.total;
            const commissionAmount = sumMoney(group.lines.map((line) => line.commissionAmount));
            const total = money(group.subtotal.plus(deliveryCharge));
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
                sellerNetAmount: money(total.minus(commissionAmount)),
                estimatedDeliveryFrom: addDays(new Date(), group.delivery.estimatedDaysMin),
                estimatedDeliveryTo: addDays(new Date(), group.delivery.estimatedDaysMax),
                courierCharge: quote.courierCharge,
                sellerExtraCharge: quote.extraCharge,
                parcelWeightKg: quote.weightKg,
                courierLane: quote.lane,
                quoteSource: quote.source,
                quoteFetchedAt: quote.fetchedAt,
                freeDeliveryApplied: quote.freeDeliveryApplied,
              },
            });

            allocations.push({ shopOrderId: shopOrder.id, amount: total });

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
              await recomputeProductAggregates(tx, line.productId);
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

          if (advanceSnapshot) {
            await this.payments.createIntent(tx, {
              orderId: order.id,
              amountDue: grandTotal,
              allocations,
              snapshot: advanceSnapshot,
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
    const filter = query.overallStatus ?? query.status;
    const where: Prisma.OrderWhereInput = {
      customerId,
      ...customerOverallStatusWhere(filter),
    };
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: "desc" },
        skip,
        take: limit,
        include: { shopOrders: { select: { status: true, shopId: true, kind: true, parentShopOrderId: true } }, payments: true },
      }),
      this.prisma.order.count({ where }),
    ]);
    const data = orders.map((order) => this.withOverallStatus(order));
    return paginate(data, total, page, limit);
  }

  async customerOrderStatusCounts(customerId: string) {
    const rows = await this.prisma.$queryRaw<{ overallStatus: string; count: number }[]>`
      SELECT overall_status AS "overallStatus", COUNT(*)::int AS count
      FROM (
        SELECT o.id,
          CASE
            WHEN bool_and(so.status = 'DELIVERED'::"OrderStatus") THEN 'DELIVERED'
            WHEN bool_and(so.status = 'CANCELLED'::"OrderStatus") THEN 'CANCELLED'
            WHEN bool_or(so.status = 'CANCELLED'::"OrderStatus") THEN 'PARTIAL'
            WHEN bool_or(so.status = 'PENDING'::"OrderStatus") THEN 'PENDING'
            WHEN bool_or(so.status = 'CONFIRMED'::"OrderStatus") THEN 'CONFIRMED'
            WHEN bool_or(so.status = 'PACKED'::"OrderStatus") THEN 'PACKED'
            WHEN bool_or(so.status = 'SHIPPED'::"OrderStatus") THEN 'SHIPPED'
            WHEN bool_or(so.status = 'FAILED_DELIVERY'::"OrderStatus") THEN 'FAILED_DELIVERY'
            ELSE 'DELIVERED'
          END AS overall_status
        FROM "Order" o
        JOIN "ShopOrder" so ON so."orderId" = o.id
        WHERE o."customerId" = ${customerId}
        GROUP BY o.id
      ) grouped
      GROUP BY overall_status
    `;
    const counts: Record<string, number> = {};
    let all = 0;
    for (const row of rows) {
      const count = Number(row.count);
      counts[row.overallStatus] = count;
      all += count;
    }
    return { all, counts };
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
    return paginate(await this.attachCodRisk(rows), total, page, limit);
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
      // Pass the actor id so the transition ownership guard accepts seller responses.
      await this.transition(
        actor.id,
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

  /**
   * Hourly stuck-order sweep. Advisory-locked so concurrent instances (or a
   * manual trigger) never double-send; reminders are also time-gated (24 h,
   * max 3) and the customer delay notice is guarded by delayNotifiedAt.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async flagStuckOrders(): Promise<void> {
    const [confirmedHours, packedHours, graceDays, reminderHours, maxReminders] =
      await Promise.all([
        this.settings.getNumber("stuck.confirmedHours"),
        this.settings.getNumber("stuck.packedHours"),
        this.settings.getNumber("stuck.shippedGraceDays"),
        this.settings.getNumber("stuck.reminderHours"),
        this.settings.getNumber("stuck.maxReminders"),
      ]);
    const now = new Date();
    const confirmedCutoff = new Date(now.getTime() - confirmedHours * 3_600_000);
    const packedCutoff = new Date(now.getTime() - packedHours * 3_600_000);
    const shippedCutoff = new Date(now.getTime() - graceDays * 86_400_000);
    const reminderCutoff = new Date(now.getTime() - reminderHours * 3_600_000);
    const mails: { to: string; subject: string; text: string }[] = [];

    await this.prisma.$transaction(
      async (tx) => {
        const lock = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext('planthaat:stuck-orders')) AS locked
        `;
        if (!lock[0]?.locked) {
          return;
        }

        // One customer "your order is delayed" notice per shop order, as soon
        // as the estimate is exceeded.
        const overdue = await tx.shopOrder.findMany({
          where: {
            status: { in: ["CONFIRMED", "PACKED", "SHIPPED", "FAILED_DELIVERY"] },
            estimatedDeliveryTo: { lt: now },
            delayNotifiedAt: null,
          },
          select: {
            id: true,
            shopOrderNumber: true,
            order: { select: { id: true, customerId: true } },
          },
        });
        for (const shopOrder of overdue) {
          await tx.notification.create({
            data: {
              userId: shopOrder.order.customerId,
              type: "ORDER_DELAYED",
              title: "আপনার অর্ডার বিলম্বিত হচ্ছে",
              body: `অর্ডার ${shopOrder.shopOrderNumber} এর আনুমানিক ডেলিভারি সময় পেরিয়ে গেছে।`,
              data: { shopOrderId: shopOrder.id, orderId: shopOrder.order.id },
            },
          });
          await tx.shopOrder.update({
            where: { id: shopOrder.id },
            data: { delayNotifiedAt: now },
          });
        }

        const stuck = await tx.shopOrder.findMany({
          where: {
            status: { in: ["CONFIRMED", "PACKED", "SHIPPED"] },
            OR: [
              {
                status: "CONFIRMED",
                OR: [
                  { confirmedAt: { lt: confirmedCutoff } },
                  { confirmedAt: null, createdAt: { lt: confirmedCutoff } },
                ],
              },
              {
                status: "PACKED",
                OR: [
                  { packedAt: { lt: packedCutoff } },
                  { packedAt: null, updatedAt: { lt: packedCutoff } },
                ],
              },
              { status: "SHIPPED", estimatedDeliveryTo: { lt: shippedCutoff } },
            ],
          },
          include: {
            shop: {
              select: {
                name: true,
                sellerProfile: {
                  select: { userId: true, user: { select: { email: true } } },
                },
              },
            },
          },
        });

        const admins = await tx.user.findMany({
          where: { role: "ADMIN", status: "ACTIVE", deletedAt: null },
          select: { id: true },
        });

        for (const shopOrder of stuck) {
          const canRemind =
            shopOrder.stuckReminderCount < maxReminders &&
            (shopOrder.stuckLastRemindedAt === null ||
              shopOrder.stuckLastRemindedAt <= reminderCutoff);

          if (canRemind) {
            await tx.shopOrder.update({
              where: { id: shopOrder.id },
              data: {
                stuckReminderCount: { increment: 1 },
                stuckLastRemindedAt: now,
              },
            });
            await tx.notification.create({
              data: {
                userId: shopOrder.shop.sellerProfile.userId,
                type: "ORDER_STUCK",
                title: "Order needs attention",
                body: `${shopOrder.shopOrderNumber} has been stuck in ${shopOrder.status} since ${shopOrder.confirmedAt?.toISOString() ?? shopOrder.createdAt.toISOString()}. Please update it.`,
                data: { shopOrderId: shopOrder.id, status: shopOrder.status },
              },
            });
            mails.push({
              to: shopOrder.shop.sellerProfile.user.email,
              subject: `PlantHaat: ${shopOrder.shopOrderNumber} is stuck in ${shopOrder.status}`,
              text: `Your order ${shopOrder.shopOrderNumber} has been in ${shopOrder.status} for too long. Please pack/ship it or contact support.`,
            });
          } else if (shopOrder.stuckReminderCount >= maxReminders && !shopOrder.stuckFlaggedAt) {
            await tx.shopOrder.update({
              where: { id: shopOrder.id },
              data: { stuckFlaggedAt: now },
            });
            if (admins.length > 0) {
              await tx.notification.createMany({
                data: admins.map((admin) => ({
                  userId: admin.id,
                  type: "ORDER_STUCK",
                  title: "Stuck order flagged",
                  body: `${shopOrder.shop.name} has not progressed ${shopOrder.shopOrderNumber} after ${maxReminders} reminders.`,
                  data: { shopOrderId: shopOrder.id, status: shopOrder.status },
                })),
              });
            }
          }
        }
      },
      { timeout: 30_000 },
    );

    for (const mail of mails) {
      this.mail.queue(mail);
    }
  }

  async listStuckOrders(query: QueryStuckOrdersDto): Promise<PaginatedResult<unknown>> {
    const [confirmedHours, packedHours, graceDays] = await Promise.all([
      this.settings.getNumber("stuck.confirmedHours"),
      this.settings.getNumber("stuck.packedHours"),
      this.settings.getNumber("stuck.shippedGraceDays"),
    ]);
    const now = new Date();
    const confirmedCutoff = new Date(now.getTime() - confirmedHours * 3_600_000);
    const packedCutoff = new Date(now.getTime() - packedHours * 3_600_000);
    const shippedCutoff = new Date(now.getTime() - graceDays * 86_400_000);
    const conditions: Prisma.ShopOrderWhereInput[] = [
      { stuckFlaggedAt: { not: null } },
    ];
    if (query.includeOverdue !== false) {
      conditions.push(
        {
          status: "CONFIRMED",
          OR: [
            { confirmedAt: { lt: confirmedCutoff } },
            { confirmedAt: null, createdAt: { lt: confirmedCutoff } },
          ],
        },
        {
          status: "PACKED",
          OR: [
            { packedAt: { lt: packedCutoff } },
            { packedAt: null, updatedAt: { lt: packedCutoff } },
          ],
        },
        { status: "SHIPPED", estimatedDeliveryTo: { lt: shippedCutoff } },
      );
    }
    const where: Prisma.ShopOrderWhereInput = {
      status: { in: ["CONFIRMED", "PACKED", "SHIPPED"] },
      OR: conditions,
    };
    const { page, limit, skip } = resolvePagination(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shopOrder.findMany({
        where,
        orderBy: [{ stuckFlaggedAt: "desc" }, { createdAt: "asc" }],
        skip,
        take: limit,
        include: SHOP_ORDER_INCLUDE,
      }),
      this.prisma.shopOrder.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async confirmReceipt(customerId: string, shopOrderId: string) {
    if (!(await this.settings.getBoolean("return.earlyRelease"))) {
      throw AppException.badRequest(
        ErrorCode.COMPLAINT_NOT_ALLOWED,
        "Early release is disabled",
      );
    }
    const shopOrder = await this.prisma.shopOrder.findFirst({
      where: { id: shopOrderId, order: { customerId } },
      select: {
        id: true,
        status: true,
        releaseAt: true,
        order: { select: { paymentMethod: true } },
        complaints: {
          where: { status: { in: ["OPEN", "SELLER_RESPONDED", "UNDER_REVIEW"] } },
          select: { id: true },
        },
      },
    });
    if (!shopOrder) {
      throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    }
    if (shopOrder.status !== "DELIVERED") {
      throw AppException.badRequest(
        ErrorCode.INVALID_STATUS_TRANSITION,
        "Only delivered orders can be confirmed",
      );
    }
    if (shopOrder.complaints.length > 0) {
      throw AppException.conflict(
        ErrorCode.COMPLAINT_NOT_ALLOWED,
        "A dispute is open for this order",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ShopOrder" WHERE "id" = ${shopOrderId} FOR UPDATE`;
      await tx.shopOrder.update({
        where: { id: shopOrderId },
        data: { releaseAt: new Date() },
      });
    });
    if (shopOrder.order.paymentMethod === "ADVANCE") {
      await this.ledger.releaseDue();
    }
    return { released: true };
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
        order: {
          select: {
            id: true,
            customerId: true,
            paymentMethod: true,
            contactPhone: true,
            shippingDistrictId: true,
            shippingArea: true,
            shippingAddressLine: true,
          },
        },
        shop: { include: { sellerProfile: { select: { id: true, userId: true } } } },
      },
    });
    if (!shopOrder) {
      throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    }
    if (actorRole === "SELLER" && shopOrder.shop.sellerProfile.userId !== actorId) {
      throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    }
    if (
      actorRole === "SELLER" &&
      shopOrder.order.paymentMethod === "ADVANCE" &&
      ["CONFIRMED", "PACKED", "SHIPPED"].includes(dto.status)
    ) {
      const intent = await this.prisma.paymentIntent.findUnique({
        where: { orderId: shopOrder.order.id },
        select: { status: true },
      });
      if (intent?.status !== "PAID" && intent?.status !== "PARTIALLY_REFUNDED") {
        throw AppException.badRequest(
          ErrorCode.PAYMENT_REQUIRED,
          "Advance payment must be verified before this order can move forward",
        );
      }
    }

    const from = shopOrder.status;
    const to = dto.status;
    if (!canTransition(from, to, actorRole)) {
      throw AppException.badRequest(
        ErrorCode.INVALID_STATUS_TRANSITION,
        `Cannot change status from ${from} to ${to}`,
      );
    }

    const proofUrls = [...new Set(dto.deliveryProofUrls ?? [])];
    if (proofUrls.length > 3) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "At most 3 delivery proofs are allowed");
    }
    if (proofUrls.length > 0 && to !== "DELIVERED") {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Delivery proof is only accepted when marking DELIVERED");
    }
    if (to === "DELIVERED") {
      const proofRequired = await this.settings.getBoolean("order.deliveryProofRequired");
      if (proofRequired && proofUrls.length === 0) {
        throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "A delivery proof photo is required");
      }
      if (proofUrls.length > 0) {
        await this.assertProofOwnership(proofUrls, actorId, actorRole);
      }
    }

    const cancelling = to === "CANCELLED";
    const restock = cancelling && shouldRestock(from, dto.restock);
    const deliveredAt = to === "DELIVERED" ? new Date() : null;
    const releaseAt =
      to === "DELIVERED" && shopOrder.order.paymentMethod === "ADVANCE"
        ? await this.ledger.releaseAtFor(deliveredAt as Date)
        : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.shopOrder.update({
        where: { id: shopOrderId },
        data: {
          status: to,
          ...timestampFor(to),
          ...(to === "DELIVERED"
            ? { deliveredAt, deliveryVerifiedById: actorId, releaseAt }
            : {}),
          ...(dto.note !== undefined ? { sellerNote: dto.note } : {}),
          ...(to === "DELIVERED" && dto.deliveryNote !== undefined
            ? { deliveryNote: dto.deliveryNote }
            : {}),
          ...(to === "DELIVERED" && proofUrls.length > 0
            ? { deliveryProofUrl: proofUrls[0] }
            : {}),
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

      if (proofUrls.length > 0) {
        await tx.shopOrderDeliveryProof.createMany({
          data: proofUrls.map((url) => ({ shopOrderId, url })),
        });
        await this.uploads.attachAssetsInTransaction(tx, proofUrls);
      }

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
            await recomputeProductAggregates(tx, item.productId);
          }
        }
      }

      if (cancelling) {
        if (shopOrder.order.paymentMethod === "ADVANCE") {
          await this.payments.createCancellationRefund(
            tx,
            shopOrderId,
            dto.note ?? "Shop order cancelled",
          );
        }
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
        // Replacements are free and must not inflate soldCount, revenue or the
        // seller ledger.
        if (shopOrder.kind !== "REPLACEMENT") {
          for (const item of shopOrder.items) {
            if (item.productId) {
              await tx.product.update({
                where: { id: item.productId },
                data: { soldCount: { increment: item.quantity } },
              });
            }
          }
          const isCod = shopOrder.order.paymentMethod === "COD";
          if (isCod) {
            await this.ledger.postCodDues(tx, {
              shopOrderId,
              orderId: shopOrder.order.id,
              sellerProfileId: shopOrder.shop.sellerProfile.id,
              commission: shopOrder.commissionAmount,
              createdById: actorId,
            });
          } else {
            const intent = await tx.paymentIntent.findUnique({
              where: { orderId: shopOrder.order.id },
              select: { id: true, status: true, amountDue: true },
            });
            if (intent && (intent.status === "PAID" || intent.status === "PARTIALLY_REFUNDED")) {
              const received = await tx.paymentSubmission.aggregate({
                where: { intentId: intent.id, status: "VERIFIED" },
                _sum: { amountReceived: true },
              });
              await this.ledger.postPaymentReceipt(tx, {
                intentId: intent.id,
                orderId: shopOrder.order.id,
                amount: received._sum.amountReceived ?? intent.amountDue,
                createdById: actorId,
              });
            }
            await this.ledger.postAdvanceDelivery(tx, {
              shopOrderId,
              orderId: shopOrder.order.id,
              sellerProfileId: shopOrder.shop.sellerProfile.id,
              total: shopOrder.total,
              commission: shopOrder.commissionAmount,
              net: shopOrder.sellerNetAmount,
              releaseAt: releaseAt as Date,
              createdById: actorId,
            });
          }
          await this.recomputeOrderPaymentStatus(tx, shopOrder.order.id);
        }
      }
    });

    if (to === "FAILED_DELIVERY" || to === "DELIVERED") {
      if (to === "DELIVERED") {
        await this.notifications.create({
          userId: shopOrder.order.customerId,
          type: "ORDER_STATUS_CHANGED",
          title: "Order delivered",
          body: releaseAt
            ? `You can report a problem until ${releaseAt.toISOString()} (return window).`
            : "Your order was delivered.",
          data: { shopOrderId, releaseAt: releaseAt?.toISOString() ?? null },
        });
      }
      const fingerprint = this.codRisk.fingerprint({
        districtId: shopOrder.order.shippingDistrictId,
        area: shopOrder.order.shippingArea,
        addressLine: shopOrder.order.shippingAddressLine,
      });
      if (to === "FAILED_DELIVERY") {
        await this.codRisk.recordFailure(shopOrder.order.contactPhone, fingerprint);
      } else {
        await this.codRisk.recordDelivery(shopOrder.order.contactPhone, fingerprint);
      }
    }

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
    return (await this.attachCodRisk([shopOrder]))[0];
  }

  async listAdminOrders(query: QueryOrdersDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.ShopOrderWhereInput = query.status ? { status: query.status } : {};
    const summary = query.view === "summary";
    // The admin list only needs identity, status, totals and item count.
    // Skipping history/payments/proofs keeps the list payload small and is an
    // additive opt-in; the detail view keeps SHOP_ORDER_INCLUDE.
    if (summary) {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.shopOrder.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          select: SHOP_ORDER_SUMMARY_SELECT,
        }),
        this.prisma.shopOrder.count({ where }),
      ]);
      return paginate(await this.attachCodRisk(rows), total, page, limit);
    }
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
    return paginate(await this.attachCodRisk(rows), total, page, limit);
  }

  async getAdminOrder(shopOrderId: string) {
    const shopOrder = await this.prisma.shopOrder.findUnique({
      where: { id: shopOrderId },
      include: SHOP_ORDER_INCLUDE,
    });
    if (!shopOrder) {
      throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    }
    return (await this.attachCodRisk([shopOrder]))[0];
  }

  private async assertProofOwnership(
    urls: string[],
    actorId: string | null,
    actorRole: OrderActor,
  ): Promise<void> {
    const rows = await this.prisma.uploadedAsset.findMany({
      where: { url: { in: urls } },
      select: { url: true, ownerId: true },
    });
    if (rows.length !== urls.length) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Invalid delivery proof");
    }
    if (actorRole === "SELLER" && rows.some((row) => row.ownerId !== actorId)) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Invalid delivery proof");
    }
  }

  private async attachCodRisk<T extends { order: { contactPhone: string } }>(
    rows: T[],
  ): Promise<(T & { codRisk: CodRiskStatus | null })[]> {
    const map = await this.codRisk.riskByPhones(rows.map((row) => row.order.contactPhone));
    return rows.map((row) => {
      const phone = this.codRisk.normalize(row.order.contactPhone);
      const status = (phone ? map.get(phone) : undefined) ?? "OK";
      return { ...row, codRisk: status === "OK" ? null : status };
    });
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
  deliveryProofs: true,
  shop: { select: { id: true, name: true, slug: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      paymentMethod: true,
      paymentStatus: true,
      contactPhone: true,
    },
  },
  parent: { select: { id: true, orderId: true, shopOrderNumber: true } },
  replacements: { select: { id: true, orderId: true, shopOrderNumber: true } },
} satisfies Prisma.ShopOrderInclude;

/** Lightweight projection for the admin/paginated order list (`?view=summary`). */
const SHOP_ORDER_SUMMARY_SELECT = {
  id: true,
  shopOrderNumber: true,
  orderId: true,
  shopId: true,
  kind: true,
  status: true,
  total: true,
  createdAt: true,
  shop: { select: { id: true, name: true, slug: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      paymentMethod: true,
      paymentStatus: true,
      contactPhone: true,
    },
  },
  items: { select: { id: true } },
} satisfies Prisma.ShopOrderSelect;

const ORDER_DETAIL_INCLUDE = {
  shopOrders: {
    include: {
      items: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
      payments: true,
      deliveryProofs: true,
      shop: { select: { id: true, name: true, slug: true } },
      parent: { select: { id: true, orderId: true, shopOrderNumber: true } },
      replacements: { select: { id: true, orderId: true, shopOrderNumber: true } },
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

function cartTotals(groups: LineGroup[]): {
  subtotal: Prisma.Decimal;
  deliveryTotal: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
} {
  const subtotal = money(groups.reduce((sum, g) => sum.plus(g.subtotal), new Prisma.Decimal(0)));
  const deliveryTotal = money(
    groups.reduce(
      (sum, group) => sum.plus(group.quote?.total ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    ),
  );
  return { subtotal, deliveryTotal, grandTotal: money(subtotal.plus(deliveryTotal)) };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

const STATUS_SEQUENCE: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "FAILED_DELIVERY",
  "DELIVERED",
];

/**
 * Customer list filters operate on the computed overall status, not a single
 * shop order. Keep this in Prisma so pagination and meta.total stay accurate.
 */
function customerOverallStatusWhere(status: string | undefined): Prisma.OrderWhereInput {
  if (!status) return {};
  if (status === "DELIVERED") {
    return { shopOrders: { every: { status: "DELIVERED" } } };
  }
  if (status === "CANCELLED") {
    return { shopOrders: { every: { status: "CANCELLED" } } };
  }
  if (status === "PARTIAL") {
    return {
      AND: [
        { shopOrders: { some: { status: "CANCELLED" } } },
        { NOT: { shopOrders: { every: { status: "CANCELLED" } } } },
      ],
    };
  }
  const index = STATUS_SEQUENCE.indexOf(status as OrderStatus);
  if (index < 0) return {};
  const earlier = STATUS_SEQUENCE.slice(0, index);
  return {
    shopOrders: {
      some: { status: status as OrderStatus },
      every: { status: { notIn: [...earlier, "CANCELLED"] } },
    },
  };
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
