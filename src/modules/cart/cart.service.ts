import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { resolveDeliveryZone } from "../orders/delivery-zone.resolver";
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
  ) {}

  async getCart(userId: string, districtId?: number) {
    return this.buildView(userId, districtId);
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
      select: { id: true },
    });
    if (!variant) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Variant not found");
    }

    const cart = await this.getOrCreateCart(userId);
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: dto.variantId } },
      update: { quantity: dto.quantity },
      create: { cartId: cart.id, variantId: dto.variantId, quantity: dto.quantity },
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

  private async buildView(userId: string, districtId?: number) {
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
        issues,
      });
      group.subtotal = group.subtotal.plus(lineTotal);
      groups.set(shop.id, group);
    }

    const shops = [];
    let subtotal = new Prisma.Decimal(0);
    let deliveryTotal = new Prisma.Decimal(0);
    for (const group of groups.values()) {
      let deliveryCharge: Prisma.Decimal | null = null;
      let freeDeliveryAbove: string | null = null;
      if (districtId) {
        const zone = await resolveDeliveryZone(this.prisma, group.shopId, districtId);
        if (zone) {
          const free =
            zone.freeDeliveryAbove !== null && group.subtotal.gte(zone.freeDeliveryAbove);
          deliveryCharge = free ? new Prisma.Decimal(0) : zone.charge;
          freeDeliveryAbove =
            zone.freeDeliveryAbove === null ? null : zone.freeDeliveryAbove.toString();
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
        deliveryCharge,
        freeDeliveryAbove,
      });
      subtotal = subtotal.plus(group.subtotal);
      if (deliveryCharge) {
        deliveryTotal = deliveryTotal.plus(deliveryCharge);
      }
    }

    return {
      shops,
      subtotal,
      deliveryTotal,
      grandTotal: subtotal.plus(deliveryTotal),
      itemCount: items.reduce((total, item) => total + item.quantity, 0),
    };
  }
}
