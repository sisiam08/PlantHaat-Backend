import { Injectable } from "@nestjs/common";

import { Prisma } from "../../generated/prisma/client";
import type { ComplaintStatus } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import { SellerContextService } from "../sellers/seller-context.service";
import { SettingsService } from "../settings/settings.service";
import type { AnalyticsRangeDto } from "./dto/analytics-range.dto";
import type {
  AdminPanelsDto,
  AnalyticsAgingBucketDto,
  AnalyticsCountRowDto,
  AnalyticsDeliveryBucketDto,
  AnalyticsMetricDto,
  AnalyticsRatingDistributionRowDto,
  AnalyticsSeriesPointDto,
  AnalyticsTopCategoryDto,
  AnalyticsTopProductDto,
  AnalyticsTopShopDto,
  SellerPanelsDto,
  SellerReleasePointDto,
  SellerAnalyticsSeriesPointDto,
} from "./dto/analytics-panels.dto";

interface ResolvedRange {
  from: Date;
  to: Date;
}

type BucketMode = "day" | "week" | "month";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const OPEN_COMPLAINT_STATUSES: ComplaintStatus[] = [
  "OPEN",
  "SELLER_RESPONDED",
  "UNDER_REVIEW",
];
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 200;

function resolveRange(dto: AnalyticsRangeDto): ResolvedRange {
  const to = dto.to ? new Date(dto.to) : new Date();
  const from = dto.from ? new Date(dto.from) : new Date(to.getTime() - 30 * DAY_MS);
  return from <= to ? { from, to } : { from: to, to: from };
}

function previousRange(range: ResolvedRange): ResolvedRange {
  const span = range.to.getTime() - range.from.getTime();
  return {
    from: new Date(range.from.getTime() - span),
    to: new Date(range.from.getTime()),
  };
}

function bucketMode(range: ResolvedRange): BucketMode {
  const days = (range.to.getTime() - range.from.getTime()) / DAY_MS;
  if (days <= 90) return "day";
  if (days <= 730) return "week";
  return "month";
}

const BUCKET_SQL: Record<BucketMode, string> = {
  // Prisma stores DateTime as `timestamp` (UTC wall time), so first label the
  // stored value as UTC, then convert it to the Asia/Dhaka calendar day.
  day: `to_char(((%COL% AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD')`,
  week: `to_char(date_trunc('week', ((%COL% AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Dhaka'))::date, 'YYYY-MM-DD')`,
  month: `to_char(date_trunc('month', ((%COL% AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Dhaka'))::date, 'YYYY-MM')`,
};

function bucketExpr(column: string, mode: BucketMode): string {
  return BUCKET_SQL[mode].replace("%COL%", column);
}

function money(value: Prisma.Decimal | number | string | null | undefined): string {
  if (value === null || value === undefined) return "0.00";
  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
}

function dec(value: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function metric(current: string, previous: string): AnalyticsMetricDto {
  return { current, previous, deltaPct: pctChange(Number(current), Number(previous)) };
}

function agingBucket(hours: number): string {
  if (hours < 6) return "0-6h";
  if (hours < 24) return "6-24h";
  if (hours < 48) return "24-48h";
  return "48h+";
}

function disputeAgingBucket(hours: number): string {
  if (hours < 24) return "<24h";
  if (hours < 72) return "1-3d";
  if (hours < 168) return "3-7d";
  return "7d+";
}

function deliveryBucket(days: number): string {
  if (days < 1) return "<1d";
  if (days < 2) return "1-2d";
  if (days < 3) return "2-3d";
  if (days < 5) return "3-5d";
  return "5d+";
}

function emptyAgingBuckets(labels: string[]): AnalyticsAgingBucketDto[] {
  return labels.map((bucket) => ({ bucket, count: 0, amount: "0.00" }));
}

function emptyDeliveryBuckets(): AnalyticsDeliveryBucketDto[] {
  return ["<1d", "1-2d", "2-3d", "3-5d", "5d+"].map((bucket) => ({ bucket, count: 0 }));
}

function sumShare(rows: AnalyticsCountRowDto[]): AnalyticsCountRowDto[] {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return rows.map((row) => ({
    ...row,
    share: total > 0 ? Math.round((row.count / total) * 1000) / 10 : 0,
  }));
}

function avgHours(rows: { from: Date; to: Date }[]): number | null {
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => sum + (row.to.getTime() - row.from.getTime()), 0);
  return Math.round((total / rows.length / HOUR_MS) * 10) / 10;
}

@Injectable()
export class AnalyticsService {
  private readonly cache = new Map<string, { expires: number; value: unknown }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sellerContext: SellerContextService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
  ) {}

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (process.env.NODE_ENV === "test") return load();
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T;
    const value = await load();
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
    return value;
  }

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
        const key = order.createdAt.toISOString().slice(0, 10);
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
      const key = order.placedAt.toISOString().slice(0, 10);
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

  /* ───────────────────────── dashboard panels ───────────────────────── */

  private async adminWindow(range: ResolvedRange) {
    const orders = await this.prisma.order.findMany({
      where: {
        placedAt: { gte: range.from, lte: range.to },
        shopOrders: { some: { kind: "ORDER" } },
      },
      select: { grandTotal: true },
    });
    const gmv = orders.reduce((sum, order) => sum.plus(order.grandTotal), new Prisma.Decimal(0));
    const shopOrders = await this.prisma.shopOrder.findMany({
      where: { kind: "ORDER", createdAt: { gte: range.from, lte: range.to } },
      select: { status: true, total: true, commissionAmount: true },
    });
    const delivered = shopOrders.filter((order) => order.status === "DELIVERED");
    const commission = delivered.reduce(
      (sum, order) => sum.plus(order.commissionAmount),
      new Prisma.Decimal(0),
    );
    const [newCustomers, newSellers, refundsAmount] = await this.prisma.$transaction([
      this.prisma.user.count({
        where: { role: "CUSTOMER", createdAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.sellerProfile.count({
        where: { createdAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.refund.aggregate({
        where: { status: "PROCESSED", processedAt: { gte: range.from, lte: range.to } },
        _sum: { amount: true },
      }),
    ]);
    const orderCount = orders.length;
    return {
      gmv,
      orders: orderCount,
      aov:
        orderCount > 0 ? gmv.div(orderCount).toDecimalPlaces(2) : new Prisma.Decimal(0),
      deliveredOrders: delivered.length,
      commission,
      newCustomers,
      newSellers,
      refundsAmount: refundsAmount._sum.amount ?? new Prisma.Decimal(0),
    };
  }

  async adminPanels(dto: AnalyticsRangeDto): Promise<AdminPanelsDto> {
    const range = resolveRange(dto);
    const previous = previousRange(range);
    const mode = bucketMode(range);
    const key = `admin:${range.from.toISOString()}:${range.to.toISOString()}`;
    return this.cached(key, async () => {
      const [current, prior] = await Promise.all([
        this.adminWindow(range),
        this.adminWindow(previous),
      ]);

      const pointRows = await this.prisma.$queryRawUnsafe<
        { bucket: string; orders: number; gmv: string }[]
      >(
        `SELECT ${bucketExpr('o."placedAt"', mode)} AS bucket,
                COUNT(*)::int AS orders,
                COALESCE(SUM(o."grandTotal"), 0)::text AS gmv
           FROM "Order" o
          WHERE o."placedAt" >= $1 AND o."placedAt" <= $2
            AND EXISTS (SELECT 1 FROM "ShopOrder" so
                         WHERE so."orderId" = o.id AND so."kind"::text = 'ORDER')
          GROUP BY 1 ORDER BY 1`,
        range.from,
        range.to,
      );
      const shopRows = await this.prisma.$queryRawUnsafe<
        {
          bucket: string;
          delivered: number;
          delivered_revenue: string;
          commission: string;
          cancelled: number;
        }[]
      >(
        `SELECT ${bucketExpr('so."createdAt"', mode)} AS bucket,
                COUNT(*) FILTER (WHERE so."status"::text = 'DELIVERED')::int AS delivered,
                COALESCE(SUM(so."total") FILTER (WHERE so."status"::text = 'DELIVERED'), 0)::text AS delivered_revenue,
                COALESCE(SUM(so."commissionAmount") FILTER (WHERE so."status"::text = 'DELIVERED'), 0)::text AS commission,
                COUNT(*) FILTER (WHERE so."status"::text = 'CANCELLED')::int AS cancelled
           FROM "ShopOrder" so
          WHERE so."kind"::text = 'ORDER' AND so."createdAt" >= $1 AND so."createdAt" <= $2
          GROUP BY 1 ORDER BY 1`,
        range.from,
        range.to,
      );
      const shopByBucket = new Map(shopRows.map((row) => [row.bucket, row]));
      const buckets = new Set([...pointRows.map((row) => row.bucket), ...shopRows.map((row) => row.bucket)]);
      const series: AnalyticsSeriesPointDto[] = [...buckets].sort().map((bucket) => {
        const point = pointRows.find((row) => row.bucket === bucket);
        const shop = shopByBucket.get(bucket);
        return {
          bucket,
          orders: point?.orders ?? 0,
          gmv: point?.gmv ?? "0.00",
          deliveredRevenue: shop?.delivered_revenue ?? "0.00",
          commission: shop?.commission ?? "0.00",
          delivered: shop?.delivered ?? 0,
          cancelled: shop?.cancelled ?? 0,
        };
      });

      const statusRows = await this.prisma.shopOrder.groupBy({
        by: ["status"],
        where: { kind: "ORDER", createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
        orderBy: { status: "asc" },
      });
      const ordersByStatus = statusRows.map((row) => ({
        key: row.status,
        count: row._count._all,
      }));

      const methodRows = await this.prisma.order.groupBy({
        by: ["paymentMethod"],
        where: {
          placedAt: { gte: range.from, lte: range.to },
          shopOrders: { some: { kind: "ORDER" } },
        },
        _count: { _all: true },
        _sum: { grandTotal: true },
      });
      const paymentMix = sumShare(
        methodRows
          .map((row) => ({
            key: row.paymentMethod,
            count: row._count._all,
            amount: money(row._sum.grandTotal),
          }))
          .sort((a, b) => b.count - a.count),
      );

      const pendingSubmissions = await this.prisma.paymentSubmission.findMany({
        where: { status: "PENDING", intent: { status: "PENDING_VERIFICATION" } },
        select: { createdAt: true, intent: { select: { id: true, amountDue: true } } },
        orderBy: { createdAt: "asc" },
      });
      const seenIntents = new Set<string>();
      const verificationBuckets = emptyAgingBuckets(["0-6h", "6-24h", "24-48h", "48h+"]);
      const verificationByBucket = new Map(verificationBuckets.map((row) => [row.bucket, row]));
      let pendingCount = 0;
      let pendingAmount = new Prisma.Decimal(0);
      const now = Date.now();
      for (const submission of pendingSubmissions) {
        if (seenIntents.has(submission.intent.id)) continue;
        seenIntents.add(submission.intent.id);
        const ageHours = (now - submission.createdAt.getTime()) / HOUR_MS;
        const bucket = verificationByBucket.get(agingBucket(ageHours));
        if (!bucket) continue;
        bucket.count += 1;
        bucket.amount = money(dec(bucket.amount).plus(submission.intent.amountDue));
        pendingCount += 1;
        pendingAmount = pendingAmount.plus(submission.intent.amountDue);
      }

      const openComplaints = await this.prisma.complaint.findMany({
        where: { status: { in: OPEN_COMPLAINT_STATUSES } },
        select: {
          status: true,
          type: true,
          createdAt: true,
          sellerResponseDueAt: true,
          shopOrder: { select: { total: true } },
        },
      });
      const disputeAging = emptyAgingBuckets(["<24h", "1-3d", "3-7d", "7d+"]);
      const disputeAgingMap = new Map(disputeAging.map((row) => [row.bucket, row]));
      for (const complaint of openComplaints) {
        const ageHours = (now - complaint.createdAt.getTime()) / HOUR_MS;
        const bucket = disputeAgingMap.get(disputeAgingBucket(ageHours));
        if (!bucket) continue;
        bucket.count += 1;
        bucket.amount = money(dec(bucket.amount).plus(complaint.shopOrder.total));
      }
      const complaintStatusRows = await this.prisma.complaint.groupBy({
        by: ["status"],
        where: { createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      });
      const complaintTypeRows = await this.prisma.complaint.groupBy({
        by: ["type"],
        where: { createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      });
      const resolvedComplaints = await this.prisma.complaint.findMany({
        where: { resolvedAt: { gte: range.from, lte: range.to } },
        select: { createdAt: true, resolvedAt: true },
      });
      const createdInRange = await this.prisma.complaint.count({
        where: { createdAt: { gte: range.from, lte: range.to } },
      });

      const pendingRefunds = await this.prisma.refund.aggregate({
        where: { status: { in: ["REQUESTED", "APPROVED"] } },
        _count: { _all: true },
        _sum: { amount: true },
      });
      const processedRefunds = await this.prisma.refund.aggregate({
        where: { status: "PROCESSED", processedAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
        _sum: { amount: true },
      });
      const advanceRefunds = await this.prisma.refundObligation.aggregate({
        where: { status: "REFUND_REQUIRED" },
        _count: { _all: true },
        _sum: { amount: true },
      });

      const pendingPayouts = await this.prisma.payout.findMany({
        where: { requestedById: { not: null }, status: { in: ["PENDING", "PROCESSING"] } },
        select: { createdAt: true, amount: true },
      });
      const paidPayouts = await this.prisma.payout.findMany({
        where: {
          requestedById: { not: null },
          status: "PAID",
          processedAt: { gte: range.from, lte: range.to },
        },
        select: { createdAt: true, processedAt: true, amount: true },
      });
      const withdrawalAging = emptyAgingBuckets(["0-6h", "6-24h", "24-48h", "48h+"]);
      const withdrawalAgingMap = new Map(withdrawalAging.map((row) => [row.bucket, row]));
      for (const payout of pendingPayouts) {
        const ageHours = (now - payout.createdAt.getTime()) / HOUR_MS;
        const bucket = withdrawalAgingMap.get(agingBucket(ageHours));
        if (!bucket) continue;
        bucket.count += 1;
        bucket.amount = money(dec(bucket.amount).plus(payout.amount));
      }

      const accountTotals = await this.prisma.ledgerEntry.groupBy({
        by: ["account"],
        where: { account: { not: null } },
        _sum: { amount: true },
      });
      const accountValue = (account: string) =>
        dec(accountTotals.find((row) => row.account === account)?._sum?.amount);
      const receipts = accountValue("BUYER_RECEIPTS");
      const bucketTotal = [
        "PLATFORM_HOLDINGS",
        "SELLER_PENDING",
        "SELLER_AVAILABLE",
        "SELLER_ON_HOLD",
        "SELLER_WITHDRAWAL_RESERVED",
        "REFUND_PAYABLE",
        "PLATFORM_COMMISSION",
        "SELLER_PAID_OUT",
        "REFUNDS_PAID",
      ].reduce((sum, account) => sum.plus(accountValue(account)), new Prisma.Decimal(0));
      const difference = receipts.minus(bucketTotal);

      const [variantCounts, activeProducts] = await this.prisma.$transaction([
        this.prisma.productVariant.findMany({
          where: { isActive: true, product: { deletedAt: null } },
          select: { stockQty: true, lowStockThreshold: true },
        }),
        this.prisma.product.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      ]);

      const ratingRows = await this.prisma.review.groupBy({
        by: ["rating"],
        where: { status: "VISIBLE" },
        _count: { _all: true },
      });
      const ratingAgg = await this.prisma.review.aggregate({
        where: { status: "VISIBLE" },
        _avg: { rating: true },
        _count: { _all: true },
      });
      const ratingDistribution: AnalyticsRatingDistributionRowDto[] = [1, 2, 3, 4, 5].map(
        (rating) => ({
          rating,
          count: ratingRows.find((row) => row.rating === rating)?._count._all ?? 0,
        }),
      );

      const deliveredOrders = await this.prisma.shopOrder.findMany({
        where: {
          kind: "ORDER",
          status: "DELIVERED",
          deliveredAt: { gte: range.from, lte: range.to },
          shippedAt: { not: null },
        },
        select: { shippedAt: true, deliveredAt: true },
      });
      const deliveryBuckets = emptyDeliveryBuckets();
      const deliveryMap = new Map(deliveryBuckets.map((row) => [row.bucket, row]));
      const deliveryDurations: number[] = [];
      for (const order of deliveredOrders) {
        if (!order.shippedAt || !order.deliveredAt) continue;
        const days = (order.deliveredAt.getTime() - order.shippedAt.getTime()) / DAY_MS;
        deliveryDurations.push(days);
        const bucket = deliveryMap.get(deliveryBucket(days));
        if (bucket) bucket.count += 1;
      }

      const shopTotals = await this.prisma.shopOrder.groupBy({
        by: ["shopId"],
        where: { kind: "ORDER", createdAt: { gte: range.from, lte: range.to } },
        _sum: { total: true },
        _count: { _all: true },
        orderBy: { _sum: { total: "desc" } },
        take: 5,
      });
      const shops = await this.prisma.shop.findMany({
        where: { id: { in: shopTotals.map((row) => row.shopId) } },
        select: { id: true, name: true, slug: true },
      });
      const shopById = new Map(shops.map((shop) => [shop.id, shop]));
      const topShops: AnalyticsTopShopDto[] = shopTotals.map((row) => ({
        shop: shopById.get(row.shopId) ?? null,
        amount: money(row._sum.total),
        orders: row._count._all,
      }));

      const productTotals = await this.prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          productId: { not: null },
          shopOrder: {
            kind: "ORDER",
            createdAt: { gte: range.from, lte: range.to },
          },
        },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { lineTotal: "desc" } },
        take: 5,
      });
      const products = await this.prisma.product.findMany({
        where: { id: { in: productTotals.map((row) => row.productId as string) } },
        select: { id: true, name: true, shop: { select: { name: true } } },
      });
      const productById = new Map(products.map((product) => [product.id, product]));
      const topProducts: AnalyticsTopProductDto[] = productTotals.map((row) => {
        const product = productById.get(row.productId as string);
        return {
          id: row.productId,
          name: product?.name ?? "Deleted product",
          shopName: product?.shop.name ?? null,
          units: row._sum.quantity ?? 0,
          amount: money(row._sum.lineTotal),
        };
      });

      const categoryRows = await this.prisma.$queryRawUnsafe<
        { id: string; name: string; units: number; amount: string }[]
      >(
        `SELECT c.id, c.name,
                SUM(oi."quantity")::int AS units,
                COALESCE(SUM(oi."lineTotal"), 0)::text AS amount
           FROM "OrderItem" oi
           JOIN "ShopOrder" so ON so.id = oi."shopOrderId"
           JOIN "Product" p ON p.id = oi."productId"
           JOIN "Category" c ON c.id = p."categoryId"
          WHERE so."kind"::text = 'ORDER' AND so."createdAt" >= $1 AND so."createdAt" <= $2
          GROUP BY c.id, c.name
          ORDER BY SUM(oi."lineTotal") DESC
          LIMIT 5`,
        range.from,
        range.to,
      );
      const topCategories: AnalyticsTopCategoryDto[] = categoryRows.map((row) => ({
        id: row.id,
        name: row.name,
        units: row.units,
        amount: row.amount,
      }));

      const districtRows = await this.prisma.order.groupBy({
        by: ["shippingDistrictName"],
        where: {
          placedAt: { gte: range.from, lte: range.to },
          shopOrders: { some: { kind: "ORDER" } },
        },
        _count: { _all: true },
        orderBy: { _count: { shippingDistrictName: "desc" } },
        take: 5,
      });
      const topDistricts: AnalyticsCountRowDto[] = districtRows.map((row) => ({
        key: row.shippingDistrictName,
        count: row._count._all,
      }));

      return {
        range: { from: range.from.toISOString(), to: range.to.toISOString() },
        previousRange: { from: previous.from.toISOString(), to: previous.to.toISOString() },
        bucket: mode,
        kpis: {
          gmv: metric(money(current.gmv), money(prior.gmv)),
          orders: metric(String(current.orders), String(prior.orders)),
          aov: metric(money(current.aov), money(prior.aov)),
          deliveredOrders: metric(
            String(current.deliveredOrders),
            String(prior.deliveredOrders),
          ),
          commission: metric(money(current.commission), money(prior.commission)),
          newCustomers: metric(String(current.newCustomers), String(prior.newCustomers)),
          newSellers: metric(String(current.newSellers), String(prior.newSellers)),
          refundsAmount: metric(money(current.refundsAmount), money(prior.refundsAmount)),
        },
        series,
        ordersByStatus,
        paymentMix,
        verification: {
          pendingCount,
          pendingAmount: money(pendingAmount),
          buckets: verificationBuckets,
        },
        disputes: {
          open: openComplaints.length,
          createdInRange,
          avgResolutionHours: avgHours(
            resolvedComplaints.map((row) => ({
              from: row.createdAt,
              to: row.resolvedAt ?? row.createdAt,
            })),
          ),
          byStatus: complaintStatusRows.map((row) => ({
            key: row.status,
            count: row._count._all,
          })),
          byType: complaintTypeRows.map((row) => ({
            key: row.type,
            count: row._count._all,
          })),
          aging: disputeAging,
        },
        refunds: {
          pendingCount: pendingRefunds._count._all,
          pendingAmount: money(pendingRefunds._sum.amount),
          processedInRange: processedRefunds._count._all,
          processedAmount: money(processedRefunds._sum.amount),
          advanceRequiredCount: advanceRefunds._count._all,
          advanceRequiredAmount: money(advanceRefunds._sum.amount),
        },
        withdrawals: {
          pendingCount: pendingPayouts.length,
          pendingAmount: money(pendingPayouts.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0))),
          paidInRangeCount: paidPayouts.length,
          paidInRangeAmount: money(
            paidPayouts.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)),
          ),
          avgTurnaroundHours: avgHours(
            paidPayouts.map((row) => ({
              from: row.createdAt,
              to: row.processedAt ?? row.createdAt,
            })),
          ),
          aging: withdrawalAging,
        },
        reconciliation: {
          receipts: money(receipts),
          buckets: money(bucketTotal),
          difference: money(difference),
          balanced: difference.isZero(),
          platformHoldings: money(accountValue("PLATFORM_HOLDINGS")),
          sellerPending: money(accountValue("SELLER_PENDING")),
          sellerAvailable: money(accountValue("SELLER_AVAILABLE")),
          sellerOnHold: money(accountValue("SELLER_ON_HOLD")),
          codDues: money(accountValue("COD_DUES").negated()),
          refundPayable: money(accountValue("REFUND_PAYABLE")),
          commission: money(accountValue("PLATFORM_COMMISSION")),
        },
        inventory: {
          lowStock: variantCounts.filter(
            (variant) => variant.stockQty > 0 && variant.stockQty <= variant.lowStockThreshold,
          ).length,
          outOfStock: variantCounts.filter((variant) => variant.stockQty <= 0).length,
          activeProducts,
        },
        ratings: {
          avg: Number(ratingAgg._avg.rating ?? 0).toFixed(2),
          count: ratingAgg._count._all,
          distribution: ratingDistribution,
        },
        delivery: {
          avgDays:
            deliveryDurations.length > 0
              ? Math.round(
                  (deliveryDurations.reduce((sum, value) => sum + value, 0) /
                    deliveryDurations.length) *
                    10,
                ) / 10
              : null,
          buckets: deliveryBuckets,
        },
        topShops,
        topProducts,
        topCategories,
        topDistricts,
      };
    });
  }

  private async sellerWindow(shopId: string, range: ResolvedRange) {
    const rows = await this.prisma.shopOrder.findMany({
      where: { shopId, kind: "ORDER", createdAt: { gte: range.from, lte: range.to } },
      select: { status: true, total: true, commissionAmount: true },
    });
    const delivered = rows.filter((row) => row.status === "DELIVERED");
    const revenue = delivered.reduce((sum, row) => sum.plus(row.total), new Prisma.Decimal(0));
    const commission = delivered.reduce(
      (sum, row) => sum.plus(row.commissionAmount),
      new Prisma.Decimal(0),
    );
    const cancelled = rows.filter((row) => row.status === "CANCELLED").length;
    return {
      orders: rows.length,
      deliveredOrders: delivered.length,
      revenue,
      commission,
      cancelled,
      aov:
        delivered.length > 0
          ? revenue.div(delivered.length).toDecimalPlaces(2)
          : new Prisma.Decimal(0),
    };
  }

  async sellerPanels(userId: string, dto: AnalyticsRangeDto): Promise<SellerPanelsDto> {
    const range = resolveRange(dto);
    const previous = previousRange(range);
    const mode = bucketMode(range);
    const { profile, shop } = await this.sellerContext.requireShop(userId);
    const key = `seller:${shop.id}:${range.from.toISOString()}:${range.to.toISOString()}`;
    return this.cached(key, async () => {
      const [current, prior] = await Promise.all([
        this.sellerWindow(shop.id, range),
        this.sellerWindow(shop.id, previous),
      ]);
      const seriesRows = await this.prisma.$queryRawUnsafe<
        {
          bucket: string;
          orders: number;
          revenue: string;
          delivered_revenue: string;
          delivered: number;
          cancelled: number;
        }[]
      >(
        `SELECT ${bucketExpr('so."createdAt"', mode)} AS bucket,
                COUNT(*)::int AS orders,
                COALESCE(SUM(so."total"), 0)::text AS revenue,
                COALESCE(SUM(so."total") FILTER (WHERE so."status"::text = 'DELIVERED'), 0)::text AS delivered_revenue,
                COUNT(*) FILTER (WHERE so."status"::text = 'DELIVERED')::int AS delivered,
                COUNT(*) FILTER (WHERE so."status"::text = 'CANCELLED')::int AS cancelled
           FROM "ShopOrder" so
          WHERE so."shopId" = $1 AND so."kind"::text = 'ORDER'
            AND so."createdAt" >= $2 AND so."createdAt" <= $3
          GROUP BY 1 ORDER BY 1`,
        shop.id,
        range.from,
        range.to,
      );
      const series: SellerAnalyticsSeriesPointDto[] = seriesRows.map((row) => ({
        bucket: row.bucket,
        orders: row.orders,
        revenue: row.revenue,
        deliveredRevenue: row.delivered_revenue,
        delivered: row.delivered,
        cancelled: row.cancelled,
      }));

      const statusRows = await this.prisma.shopOrder.groupBy({
        by: ["status"],
        where: { shopId: shop.id, kind: "ORDER", createdAt: { gte: range.from, lte: range.to } },
        _count: { _all: true },
      });
      const ordersByStatus = statusRows.map((row) => ({
        key: row.status,
        count: row._count._all,
      }));

      const methodRows = await this.prisma.shopOrder.findMany({
        where: { shopId: shop.id, kind: "ORDER", createdAt: { gte: range.from, lte: range.to } },
        select: { total: true, order: { select: { paymentMethod: true } } },
      });
      const methodMap = new Map<string, { count: number; amount: Prisma.Decimal }>();
      for (const row of methodRows) {
        const entry = methodMap.get(row.order.paymentMethod) ?? {
          count: 0,
          amount: new Prisma.Decimal(0),
        };
        entry.count += 1;
        entry.amount = entry.amount.plus(row.total);
        methodMap.set(row.order.paymentMethod, entry);
      }
      const paymentMix = sumShare(
        [...methodMap.entries()]
          .map(([method, entry]) => ({
            key: method,
            count: entry.count,
            amount: money(entry.amount),
          }))
          .sort((a, b) => b.count - a.count),
      );

      const balances = await this.ledger.balances(profile.id);
      const codDuesLimit = await this.settings.getNumber("wallet.codDuesLimit");

      const releaseRows = await this.prisma.ledgerEntry.findMany({
        where: {
          sellerProfileId: profile.id,
          account: "SELLER_PENDING",
          releaseAt: { gt: new Date() },
        },
        select: { releaseAt: true, amount: true },
      });
      const releaseMap = new Map<string, { amount: Prisma.Decimal; count: number }>();
      for (const row of releaseRows) {
        if (!row.releaseAt) continue;
        const bucket = row.releaseAt.toISOString().slice(0, 10);
        const entry = releaseMap.get(bucket) ?? { amount: new Prisma.Decimal(0), count: 0 };
        entry.amount = entry.amount.plus(row.amount);
        entry.count += 1;
        releaseMap.set(bucket, entry);
      }
      const releaseTimeline: SellerReleasePointDto[] = [...releaseMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 30)
        .map(([bucket, entry]) => ({
          bucket,
          amount: money(entry.amount),
          count: entry.count,
        }));

      const productTotals = await this.prisma.orderItem.groupBy({
        by: ["productId"],
        where: {
          productId: { not: null },
          shopOrder: {
            shopId: shop.id,
            kind: "ORDER",
            createdAt: { gte: range.from, lte: range.to },
          },
        },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { lineTotal: "desc" } },
        take: 5,
      });
      const products = await this.prisma.product.findMany({
        where: { id: { in: productTotals.map((row) => row.productId as string) } },
        select: { id: true, name: true },
      });
      const productById = new Map(products.map((product) => [product.id, product]));
      const topProducts: AnalyticsTopProductDto[] = productTotals.map((row) => ({
        id: row.productId,
        name: productById.get(row.productId as string)?.name ?? "Deleted product",
        units: row._sum.quantity ?? 0,
        amount: money(row._sum.lineTotal),
      }));

      const variants = await this.prisma.productVariant.findMany({
        where: { product: { shopId: shop.id, deletedAt: null }, isActive: true },
        select: { stockQty: true, lowStockThreshold: true },
      });
      const activeProducts = await this.prisma.product.count({
        where: { shopId: shop.id, deletedAt: null, status: "ACTIVE" },
      });

      const ratingRows = await this.prisma.review.groupBy({
        by: ["rating"],
        where: { shopId: shop.id, status: "VISIBLE" },
        _count: { _all: true },
      });
      const ratingAgg = await this.prisma.review.aggregate({
        where: { shopId: shop.id, status: "VISIBLE" },
        _avg: { rating: true },
        _count: { _all: true },
      });

      const complaints = await this.prisma.complaint.findMany({
        where: { shopId: shop.id, status: { in: OPEN_COMPLAINT_STATUSES } },
        select: { status: true, sellerResponseDueAt: true },
      });
      const resolved = await this.prisma.complaint.findMany({
        where: { shopId: shop.id, resolvedAt: { gte: range.from, lte: range.to } },
        select: { createdAt: true, resolvedAt: true },
      });
      const dueSoon = complaints.filter(
        (row) =>
          row.sellerResponseDueAt !== null &&
          row.sellerResponseDueAt.getTime() > Date.now() &&
          row.sellerResponseDueAt.getTime() <= Date.now() + DAY_MS,
      ).length;

      const withdrawals = await this.prisma.payout.findMany({
        where: { sellerProfileId: profile.id, requestedById: { not: null } },
        select: { status: true, amount: true, createdAt: true, processedAt: true },
      });
      const pendingWithdrawals = withdrawals.filter(
        (row) => row.status === "PENDING" || row.status === "PROCESSING",
      );
      const paidWithdrawals = withdrawals.filter((row) => row.status === "PAID");

      const deliveredOrders = await this.prisma.shopOrder.findMany({
        where: {
          shopId: shop.id,
          kind: "ORDER",
          status: "DELIVERED",
          deliveredAt: { gte: range.from, lte: range.to },
          shippedAt: { not: null },
        },
        select: { shippedAt: true, deliveredAt: true },
      });
      const deliveryBuckets = emptyDeliveryBuckets();
      const deliveryMap = new Map(deliveryBuckets.map((row) => [row.bucket, row]));
      const deliveryDurations: number[] = [];
      for (const order of deliveredOrders) {
        if (!order.shippedAt || !order.deliveredAt) continue;
        const days = (order.deliveredAt.getTime() - order.shippedAt.getTime()) / DAY_MS;
        deliveryDurations.push(days);
        const bucket = deliveryMap.get(deliveryBucket(days));
        if (bucket) bucket.count += 1;
      }

      return {
        range: { from: range.from.toISOString(), to: range.to.toISOString() },
        previousRange: { from: previous.from.toISOString(), to: previous.to.toISOString() },
        bucket: mode,
        kpis: {
          revenue: metric(money(current.revenue), money(prior.revenue)),
          orders: metric(String(current.orders), String(prior.orders)),
          aov: metric(money(current.aov), money(prior.aov)),
          deliveredOrders: metric(
            String(current.deliveredOrders),
            String(prior.deliveredOrders),
          ),
          commission: metric(money(current.commission), money(prior.commission)),
          cancelledOrders: metric(String(current.cancelled), String(prior.cancelled)),
        },
        series,
        ordersByStatus,
        paymentMix,
        wallet: {
          available: money(balances.available),
          pending: money(balances.pending),
          onHold: money(balances.onHold),
          withdrawalReserved: money(balances.withdrawalReserved),
          totalWithdrawn: money(balances.totalWithdrawn),
          codDues: money(balances.codDues),
          codDuesLimit: codDuesLimit.toFixed(2),
          net: money(balances.net),
        },
        releaseTimeline,
        topProducts,
        inventory: {
          lowStock: variants.filter(
            (variant) => variant.stockQty > 0 && variant.stockQty <= variant.lowStockThreshold,
          ).length,
          outOfStock: variants.filter((variant) => variant.stockQty <= 0).length,
          activeProducts,
        },
        ratings: {
          avg: Number(ratingAgg._avg.rating ?? shop.ratingAvg).toFixed(2),
          count: ratingAgg._count._all,
          distribution: [1, 2, 3, 4, 5].map((rating) => ({
            rating,
            count: ratingRows.find((row) => row.rating === rating)?._count._all ?? 0,
          })),
        },
        disputes: {
          open: complaints.length,
          evidenceDueSoon: dueSoon,
          avgResolutionHours: avgHours(
            resolved.map((row) => ({
              from: row.createdAt,
              to: row.resolvedAt ?? row.createdAt,
            })),
          ),
          byStatus: sumShare(
            [...complaints.reduce((map, row) => map.set(row.status, (map.get(row.status) ?? 0) + 1), new Map<string, number>())].map(
              ([key, count]) => ({ key, count }),
            ),
          ),
        },
        withdrawals: {
          pendingCount: pendingWithdrawals.length,
          pendingAmount: money(
            pendingWithdrawals.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)),
          ),
          paidCount: paidWithdrawals.length,
          paidAmount: money(
            paidWithdrawals.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)),
          ),
          avgTurnaroundHours: avgHours(
            paidWithdrawals
              .filter((row) => row.processedAt)
              .map((row) => ({ from: row.createdAt, to: row.processedAt as Date })),
          ),
        },
        delivery: {
          avgDays:
            deliveryDurations.length > 0
              ? Math.round(
                  (deliveryDurations.reduce((sum, value) => sum + value, 0) /
                    deliveryDurations.length) *
                    10,
                ) / 10
              : null,
          buckets: deliveryBuckets,
        },
      };
    });
  }
}
