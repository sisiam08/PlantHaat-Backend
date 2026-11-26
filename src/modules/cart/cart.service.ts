import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  DeliveryQuoteService,
  type DeliveryQuoteLine,
} from "../delivery-quote/delivery-quote.service";
import { resolveDeliveryCondition } from "../orders/delivery-condition.resolver";
import { SettingsService } from "../settings/settings.service";
import type { PutCartItemDto } from "./dto/put-cart-item.dto";

const CART_ITEM_INCLUDE = {
  variant: {
    include: {
      product: {
        include: {
          images: { select: { url: true, isPrimary: true } },
          shop: { include: { sellerProfile: { select: { status: true } } } },
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

interface CartIssue {
  code: string;
  available?: number;
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly deliveryQuote: DeliveryQuoteService,
  ) {}

  async getCart(userId: string, districtId?: number, thanaId?: string) {
    return this.buildView(userId, districtId, thanaId);
  }

  async putItem(userId: string, dto: PutCartItemDto) {
    const maxQty = await this.settings.getNumber("checkout.maxQtyPerItem");
    if (dto.quantity > maxQty) {
      throw AppException.unprocessable(
        ErrorCode.QUANTITY_LIMIT_EXCEEDED,
        `You can order at most ${maxQty} of an item`,
      );
    }

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, product: { deletedAt: null } },
      select: { id: true, price: true },
    });
    if (!variant) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Variant not found");
    }

    const cart = await this.getOrCreateCart(userId);
    // Re-adding/updating a line resets the snapshot to the price the customer
    // just saw, so only later price changes are flagged.
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: dto.variantId } },
      update: { quantity: dto.quantity, priceSnapshot: variant.price },
      create: {
        cartId: cart.id,
        variantId: dto.variantId,
        quantity: dto.quantity,
        priceSnapshot: variant.price,
      },
    });
    return this.buildView(userId);
  }

  async removeItem(userId: string, variantId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
    return this.buildView(userId);
  }

  async clear(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.buildView(userId);
  }

  async getOrCreateCart(userId: string) {
    return this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  private async buildView(userId: string, districtId?: number, thanaId?: string) {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: CART_ITEM_INCLUDE,
      orderBy: { createdAt: "asc" },
    });

    interface GroupItem {
      variantId: string;
      productId: string;
      productName: string;
      variantName: string;
      slug: string;
      image: string | null;
      unitPrice: Prisma.Decimal;
      quantity: number;
      lineTotal: Prisma.Decimal;
      stockQty: number;
      priceChanged: boolean;
      priceChangedFrom: string | null;
      priceChangedTo: string | null;
      issues: CartIssue[];
    }
    const groups = new Map<
      string,
      {
        shopId: string;
        shopName: string;
        shopSlug: string;
        shopLogoUrl: string | null;
        shopDistrict: string | null;
        shopVerified: boolean;
        items: GroupItem[];
        subtotal: Prisma.Decimal;
        priceChanged: boolean;
        quoteLines: DeliveryQuoteLine[];
      }
    >();

    for (const item of items) {
      const variant = item.variant;
      const product = variant.product;
      const shop = product.shop;
      const issues: CartIssue[] = [];
      if (product.status !== "ACTIVE" || product.deletedAt) {
        issues.push({ code: "PRODUCT_UNAVAILABLE" });
      }
      if (!variant.isActive) {
        issues.push({ code: "VARIANT_UNAVAILABLE" });
      }
      if (shop.status !== "ACTIVE" || shop.sellerProfile.status !== "APPROVED") {
        issues.push({ code: "SHOP_UNAVAILABLE" });
      }
      if (variant.stockQty <= 0) {
        issues.push({ code: "OUT_OF_STOCK", available: 0 });
      } else if (variant.stockQty < item.quantity) {
        issues.push({ code: "INSUFFICIENT_STOCK", available: variant.stockQty });
      }

      const lineTotal = variant.price.mul(item.quantity);
      const snapshot = item.priceSnapshot;
      const priceChanged = snapshot != null && !snapshot.equals(variant.price);
      const primary = product.images.find((image) => image.isPrimary) ?? product.images[0];
      const group = groups.get(shop.id) ?? {
        shopId: shop.id,
        shopName: shop.name,
        shopSlug: shop.slug,
        shopLogoUrl: shop.logoUrl,
        shopDistrict: shop.district,
        shopVerified: shop.sellerProfile.status === "APPROVED",
        items: [],
        subtotal: new Prisma.Decimal(0),
        priceChanged: false,
        quoteLines: [],
      };
      group.items.push({
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        variantName: variant.name,
        slug: product.slug,
        image: primary?.url ?? null,
        unitPrice: variant.price,
        quantity: item.quantity,
        lineTotal,
        stockQty: variant.stockQty,
        priceChanged,
        priceChangedFrom: priceChanged ? snapshot.toString() : null,
        priceChangedTo: priceChanged ? variant.price.toString() : null,
        issues,
      });
      group.subtotal = group.subtotal.plus(lineTotal);
      group.priceChanged = group.priceChanged || priceChanged;
      group.quoteLines.push({
        weightKg: product.weightKg,
        quantity: item.quantity,
        extraChargeAfterQty: product.extraChargeAfterQty,
        extraChargePerUnit: product.extraChargePerUnit,
      });
      groups.set(shop.id, group);
    }

    const selectedDistrict = districtId
      ? await this.prisma.district.findUnique({
          where: { id: districtId },
          select: { insideDhaka: true, name: true },
        })
      : null;
    const validThanaId =
      districtId && thanaId
        ? (
            await this.prisma.thana.findFirst({
              where: { id: thanaId, districtId },
              select: { id: true },
            })
          )?.id ?? null
        : null;
    const shops = [];
    let subtotal = new Prisma.Decimal(0);
    let deliveryTotal = new Prisma.Decimal(0);
    for (const group of groups.values()) {
      let deliveryCharge: Prisma.Decimal | null = null;
      let freeDeliveryAbove: string | null = null;
      let freeDeliveryEnabled: boolean | null = null;
      let estimatedDaysMin: number | null = null;
      let estimatedDaysMax: number | null = null;
      let deliveryCondition: "INSIDE_DHAKA" | "OUTSIDE_DHAKA" | null = null;
      let codAllowed: boolean | null = null;
      let advanceAllowed: boolean | null = null;
      let courierCharge: string | null = null;
      let sellerExtraCharge: string | null = null;
      let deliveryQuoteSource: string | null = null;
      let deliveryQuoteEstimated = false;
      let deliveryReason: string | null = null;
      let parcelWeightKg: string | null = null;
      let freeDeliveryApplied = false;
      // null = no district chosen yet; false = no quote/route; true = priced.
      let deliverable: boolean | null = null;
      if (districtId) {
        deliverable = false;
        if (!selectedDistrict) {
          deliveryReason = "DISTRICT_UNMAPPED";
        } else {
          const delivery = await resolveDeliveryCondition(
            this.prisma,
            group.shopId,
            districtId,
            selectedDistrict.insideDhaka,
          );
          if (delivery) {
            freeDeliveryAbove =
              delivery.freeDeliveryAbove === null
                ? null
                : delivery.freeDeliveryAbove.toString();
            freeDeliveryEnabled = delivery.freeDeliveryEnabled;
            estimatedDaysMin = delivery.estimatedDaysMin;
            estimatedDaysMax = delivery.estimatedDaysMax;
            deliveryCondition = delivery.condition;
            codAllowed = delivery.paymentMode !== "ADVANCE_ONLY";
            advanceAllowed = delivery.paymentMode !== "COD_ONLY";
            const quote = await this.deliveryQuote.quoteShop({
              shopId: group.shopId,
              districtId,
              thanaId: validThanaId,
              lines: group.quoteLines,
              subtotal: group.subtotal,
              freeDeliveryEnabled: delivery.freeDeliveryEnabled,
              freeDeliveryAbove: delivery.freeDeliveryAbove,
            });
            deliverable = quote.available;
            deliveryCharge = quote.available ? quote.total : null;
            courierCharge = quote.courierCharge?.toString() ?? null;
            sellerExtraCharge = quote.extraCharge.toString();
            deliveryQuoteSource = quote.source;
            deliveryQuoteEstimated = quote.estimated;
            deliveryReason = quote.available ? null : (quote.reason ?? null);
            parcelWeightKg = quote.weightKg.toString();
            freeDeliveryApplied = quote.freeDeliveryApplied;
          } else {
            deliveryReason = "DISTRICT_UNMAPPED";
          }
        }
      }
      shops.push({
        shopId: group.shopId,
        shopName: group.shopName,
        shopSlug: group.shopSlug,
        shop: {
          logoUrl: group.shopLogoUrl,
          district: group.shopDistrict,
          verified: group.shopVerified,
        },
        items: group.items,
        subtotal: group.subtotal,
        priceChanged: group.priceChanged,
        deliverable,
        deliveryCharge,
        freeDeliveryAbove,
        freeDeliveryEnabled,
        estimatedDaysMin,
        estimatedDaysMax,
        deliveryCondition,
        codAllowed,
        advanceAllowed,
        courierCharge,
        sellerExtraCharge,
        deliveryQuoteSource,
        deliveryQuoteEstimated,
        deliveryReason,
        parcelWeightKg,
        freeDeliveryApplied,
      });
      subtotal = subtotal.plus(group.subtotal);
      if (deliveryCharge) {
        deliveryTotal = deliveryTotal.plus(deliveryCharge);
      }
    }

    const changedLineCount = shops.reduce(
      (count, shop) => count + shop.items.filter((item) => item.priceChanged).length,
      0,
    );
    return {
      shops,
      subtotal,
      deliveryTotal,
      grandTotal: subtotal.plus(deliveryTotal),
      itemCount: items.reduce((total, item) => total + item.quantity, 0),
      priceChanged: changedLineCount > 0,
      changedLineCount,
    };
  }
}

