import { Injectable } from "@nestjs/common";

import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SellerContextService } from "../sellers/seller-context.service";
import type { AnalyticsRangeDto } from "./dto/analytics-range.dto";

interface ResolvedRange {
  from: Date;
  to: Date;
}

function resolveRange(dto: AnalyticsRangeDto): ResolvedRange {
  const to = dto.to ? new Date(dto.to) : new Date();
  const from = dto.from ? new Date(dto.from) : new Date(to.getTime() - 30 * 86_400_000);
  return { from, to };
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellerContext: SellerContextService,
  ) {}

  async sellerOverview(userId: string, dto: AnalyticsRangeDto) {
    const range = resolveRange(dto);
    const { profile, shop } = await this.sellerContext.requireShop(userId);

    const shopOrders = await this.prisma.shopOrder.findMany({
      where: {
        shopId: shop.id,
        kind: "ORDER",
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { status: true, total: true, commissionAmount: true, createdAt: true },
    });

    const ordersByStatus: Record<string, number> = {};
    let revenue = new Prisma.Decimal(0);
    let commissionPaid = new Prisma.Decimal(0);
    let delivered = 0;
    const daily = new Map<string, { orders: number; revenue: Prisma.Decimal }>();

    for (const order of shopOrders) {
      ordersByStatus[order.status] = (ordersByStatus[order.status] ?? 0) + 1;
      if (order.status === "DELIVERED") {
        delivered += 1;
        revenue = revenue.plus(order.total);
        commissionPaid = commissionPaid.plus(order.commissionAmount);
        const key = dayKey(order.createdAt);
        const entry = daily.get(key) ?? { orders: 0, revenue: new Prisma.Decimal(0) };
        entry.orders += 1;
        entry.revenue = entry.revenue.plus(order.total);
        daily.set(key, entry);
      }
    }

    const topProducts = await this.prisma.product.findMany({
      where: { shopId: shop.id },
      orderBy: { soldCount: "desc" },
      take: 5,
      select: { id: true, name: true, soldCount: true, ratingAvg: true },
    });

    const variants = await this.prisma.productVariant.findMany({
      where: { product: { shopId: shop.id }, isActive: true },
      select: {
        id: true,
        name: true,
        stockQty: true,
        lowStockThreshold: true,
        product: { select: { name: true } },
      },
    });

    return {
      range,
      sellerProfileId: profile.id,
      shopId: shop.id,
      ordersByStatus,
      deliveredOrders: delivered,
      revenue,
      commissionPaid,
      averageOrderValue:
        delivered > 0 ? revenue.div(delivered).toDecimalPlaces(2) : new Prisma.Decimal(0),
      topProducts,
      lowStock: variants
        .filter((variant) => variant.stockQty <= variant.lowStockThreshold)
        .slice(0, 20),
      rating: { avg: shop.ratingAvg, count: shop.ratingCount },
      dailySeries: [...daily.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, orders: value.orders, revenue: value.revenue })),
    };
  }

  async sellerDashboard(userId: string) {
    const { profile, shop } = await this.sellerContext.requireShop(userId);
    const [pendingOrders, unreadNotifications, unansweredQuestions, stuckOrders] =
      await this.prisma.$transaction([
        this.prisma.shopOrder.count({ where: { shopId: shop.id, status: "PENDING" } }),
        this.prisma.notification.count({ where: { userId, readAt: null } }),
        this.prisma.productQuestion.count({
          where: {
            product: { shopId: shop.id },
            status: "VISIBLE",
            answers: { none: { status: "VISIBLE" } },
          },
        }),
        this.prisma.shopOrder.count({
          where: { shopId: shop.id, stuckFlaggedAt: { not: null } },
        }),
      ]);
    const variants = await this.prisma.productVariant.findMany({
      where: { product: { shopId: shop.id }, isActive: true },
      select: { stockQty: true, lowStockThreshold: true },
    });
    return {
      sellerProfileId: profile.id,
      pendingOrders,
      unreadNotifications,
      unansweredQuestions,
      stuckOrders,
      lowStockVariants: variants.filter((v) => v.stockQty <= v.lowStockThreshold).length,
    };
  }

  async adminOverview(dto: AnalyticsRangeDto) {
    const range = resolveRange(dto);

    // Replacement orders are free and must not affect GMV / order counts.
    const orders = await this.prisma.order.findMany({
      where: {
        placedAt: { gte: range.from, lte: range.to },
        shopOrders: { some: { kind: "ORDER" } },
      },
      select: {
        grandTotal: true,
        placedAt: true,
        shippingDistrictName: true,
      },
    });
    const gmv = orders.reduce((sum, order) => sum.plus(order.grandTotal), new Prisma.Decimal(0));

    const shopOrders = await this.prisma.shopOrder.findMany({
      where: { kind: "ORDER", createdAt: { gte: range.from, lte: range.to } },
      select: { status: true, commissionAmount: true, total: true, shopId: true, createdAt: true },
    });
    const commissionEarned = shopOrders
      .filter((order) => order.status === "DELIVERED")
      .reduce((sum, order) => sum.plus(order.commissionAmount), new Prisma.Decimal(0));
    const cancelled = shopOrders.filter((order) => order.status === "CANCELLED").length;

    const [
      newCustomers,
      newSellers,
      pendingApprovals,
      complaintCount,
      stuckOrders,
      suspendedSellerOpenOrders,
      falseDeliveryFlags,
    ] = await this.prisma.$transaction([
      this.prisma.user.count({
        where: { role: "CUSTOMER", createdAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.sellerProfile.count({
        where: { createdAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.sellerProfile.count({ where: { status: "PENDING" } }),
      this.prisma.complaint.count({
        where: { createdAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.shopOrder.count({ where: { stuckFlaggedAt: { not: null } } }),
      this.prisma.shopOrder.count({
        where: {
          shop: { sellerProfile: { status: "SUSPENDED" } },
          status: { in: ["PENDING", "CONFIRMED", "PACKED", "SHIPPED", "FAILED_DELIVERY"] },
        },
      }),
      this.prisma.sellerProfile.aggregate({ _sum: { falseDeliveryFlags: true } }),
    ]);

    const shopTotals = new Map<string, Prisma.Decimal>();
    for (const order of shopOrders) {
      shopTotals.set(
        order.shopId,
        (shopTotals.get(order.shopId) ?? new Prisma.Decimal(0)).plus(order.total),
      );
    }
    const topShopIds = [...shopTotals.entries()].sort((a, b) => b[1].comparedTo(a[1])).slice(0, 5);
    const shops = await this.prisma.shop.findMany({
      where: { id: { in: topShopIds.map(([id]) => id) } },
      select: { id: true, name: true, slug: true },
    });
    const shopById = new Map(shops.map((shop) => [shop.id, shop]));
    const topShops = topShopIds.map(([id, total]) => ({ shop: shopById.get(id) ?? null, total }));

    const topProducts = await this.prisma.product.findMany({
      orderBy: { soldCount: "desc" },
      take: 5,
      select: { id: true, name: true, soldCount: true, shop: { select: { name: true } } },
    });

    const districtCounts = new Map<string, number>();
    const daily = new Map<string, { orders: number; gmv: Prisma.Decimal }>();
    for (const order of orders) {
      districtCounts.set(
        order.shippingDistrictName,
        (districtCounts.get(order.shippingDistrictName) ?? 0) + 1,
      );
      const key = dayKey(order.placedAt);
      const entry = daily.get(key) ?? { orders: 0, gmv: new Prisma.Decimal(0) };
      entry.orders += 1;
      entry.gmv = entry.gmv.plus(order.grandTotal);
      daily.set(key, entry);
    }
    const topDistricts = [...districtCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([district, count]) => ({ district, count }));

    const orderCount = orders.length;
    return {
      range,
      gmv,
      orderCount,
      commissionEarned,
      newCustomers,
      newSellers,
      pendingApprovals,
      stuckOrders,
      suspendedSellerOpenOrders,
      falseDeliveryFlags: falseDeliveryFlags._sum.falseDeliveryFlags ?? 0,
      cancellationRate: orderCount > 0 ? Math.round((cancelled / orderCount) * 1000) / 10 : 0,
      complaintRate: orderCount > 0 ? Math.round((complaintCount / orderCount) * 1000) / 10 : 0,
      topShops,
      topProducts,
      topDistricts,
      dailySeries: [...daily.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, orders: value.orders, gmv: value.gmv })),
    };
  }
}
