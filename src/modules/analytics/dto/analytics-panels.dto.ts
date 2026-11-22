import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Read-only dashboard series DTOs. Every money value is a decimal string and
 * every bucket is an Asia/Dhaka calendar date (`YYYY-MM-DD`) or week/month
 * start. Counts are integers. Series are capped by the service (<= 90 points).
 */
export class AnalyticsMetricDto {
  @ApiProperty({ type: String, description: "Current-period value (decimal string)" })
  current!: string;
  @ApiProperty({ type: String, description: "Previous equal-length period value" })
  previous!: string;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: "Percent change vs the previous period (null when previous is 0)",
  })
  deltaPct!: number | null;
}

export class AnalyticsSeriesPointDto {
  @ApiProperty({ example: "2026-11-20" }) bucket!: string;
  @ApiProperty() orders!: number;
  @ApiProperty({ type: String, description: "Decimal string" }) gmv!: string;
  @ApiProperty({ type: String, description: "Delivered revenue in the bucket (decimal string)" })
  deliveredRevenue!: string;
  @ApiProperty({ type: String, description: "Delivered commission (decimal string)" })
  commission!: string;
  @ApiProperty() delivered!: number;
  @ApiProperty() cancelled!: number;
}

export class SellerAnalyticsSeriesPointDto {
  @ApiProperty({ example: "2026-11-20" }) bucket!: string;
  @ApiProperty() orders!: number;
  @ApiProperty({ type: String, description: "Decimal string" }) revenue!: string;
  @ApiProperty({
    type: String,
    description: "Delivered-only revenue in the bucket (decimal string)",
  })
  deliveredRevenue!: string;
  @ApiProperty() delivered!: number;
  @ApiProperty() cancelled!: number;
}

export class AnalyticsCountRowDto {
  @ApiProperty({ description: "Status/type/method/bucket key" }) key!: string;
  @ApiProperty() count!: number;
  @ApiPropertyOptional({ type: String, description: "Decimal string amount" }) amount?: string;
  @ApiPropertyOptional({ description: "Share of the total (0-100)" }) share?: number;
}

export class AnalyticsAgingBucketDto {
  @ApiProperty({ example: "6-24h" }) bucket!: string;
  @ApiProperty() count!: number;
  @ApiProperty({ type: String, description: "Decimal string amount" }) amount!: string;
}

export class AnalyticsTopShopDto {
  @ApiPropertyOptional({
    type: Object,
    example: { id: "3f1c9b2e-0000-0000-0000-000000000000", name: "Green Valley", slug: "green-valley" },
  })
  shop!: { id: string; name: string; slug: string } | null;
  @ApiProperty({ type: String, description: "Decimal string" }) amount!: string;
  @ApiProperty() orders!: number;
}

export class AnalyticsTopProductDto {
  @ApiPropertyOptional({ nullable: true, type: String }) id!: string | null;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String }) shopName?: string | null;
  @ApiProperty() units!: number;
  @ApiProperty({ type: String, description: "Decimal string revenue" }) amount!: string;
}

export class AnalyticsTopCategoryDto {
  @ApiPropertyOptional({ nullable: true, type: String }) id!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty() units!: number;
  @ApiProperty({ type: String, description: "Decimal string revenue" }) amount!: string;
}

export class AnalyticsRatingDistributionRowDto {
  @ApiProperty({ description: "Rating 1-5" }) rating!: number;
  @ApiProperty() count!: number;
}

export class AnalyticsDeliveryBucketDto {
  @ApiProperty({ example: "1-2d" }) bucket!: string;
  @ApiProperty() count!: number;
}

export class AdminPanelsKpisDto {
  @ApiProperty({ type: AnalyticsMetricDto }) gmv!: AnalyticsMetricDto;
  @ApiProperty({ type: AnalyticsMetricDto }) orders!: AnalyticsMetricDto;
  @ApiProperty({ type: AnalyticsMetricDto }) aov!: AnalyticsMetricDto;
  @ApiProperty({ type: AnalyticsMetricDto }) deliveredOrders!: AnalyticsMetricDto;
  @ApiProperty({ type: AnalyticsMetricDto }) commission!: AnalyticsMetricDto;
  @ApiProperty({ type: AnalyticsMetricDto }) newCustomers!: AnalyticsMetricDto;
  @ApiProperty({ type: AnalyticsMetricDto }) newSellers!: AnalyticsMetricDto;
  @ApiProperty({ type: AnalyticsMetricDto }) refundsAmount!: AnalyticsMetricDto;
}

export class AdminVerificationAgingDto {
  @ApiProperty() pendingCount!: number;
  @ApiProperty({ type: String, description: "Decimal string" }) pendingAmount!: string;
  @ApiProperty({ type: [AnalyticsAgingBucketDto] }) buckets!: AnalyticsAgingBucketDto[];
}

export class AdminDisputesHealthDto {
  @ApiProperty() open!: number;
  @ApiProperty() createdInRange!: number;
  @ApiProperty({ nullable: true, type: Number }) avgResolutionHours!: number | null;
  @ApiProperty({ type: [AnalyticsCountRowDto] }) byStatus!: AnalyticsCountRowDto[];
  @ApiProperty({ type: [AnalyticsCountRowDto] }) byType!: AnalyticsCountRowDto[];
  @ApiProperty({ type: [AnalyticsAgingBucketDto] }) aging!: AnalyticsAgingBucketDto[];
}

export class AdminRefundsHealthDto {
  @ApiProperty() pendingCount!: number;
  @ApiProperty({ type: String }) pendingAmount!: string;
  @ApiProperty() processedInRange!: number;
  @ApiProperty({ type: String }) processedAmount!: string;
  @ApiProperty() advanceRequiredCount!: number;
  @ApiProperty({ type: String }) advanceRequiredAmount!: string;
}

export class AdminWithdrawalsHealthDto {
  @ApiProperty() pendingCount!: number;
  @ApiProperty({ type: String }) pendingAmount!: string;
  @ApiProperty() paidInRangeCount!: number;
  @ApiProperty({ type: String }) paidInRangeAmount!: string;
  @ApiProperty({ nullable: true, type: Number }) avgTurnaroundHours!: number | null;
  @ApiProperty({ type: [AnalyticsAgingBucketDto] }) aging!: AnalyticsAgingBucketDto[];
}

export class AdminReconciliationHealthDto {
  @ApiProperty({ type: String }) receipts!: string;
  @ApiProperty({ type: String }) buckets!: string;
  @ApiProperty({ type: String }) difference!: string;
  @ApiProperty() balanced!: boolean;
  @ApiProperty({ type: String }) platformHoldings!: string;
  @ApiProperty({ type: String }) sellerPending!: string;
  @ApiProperty({ type: String }) sellerAvailable!: string;
  @ApiProperty({ type: String }) sellerOnHold!: string;
  @ApiProperty({ type: String }) codDues!: string;
  @ApiProperty({ type: String }) refundPayable!: string;
  @ApiProperty({ type: String }) commission!: string;
}

export class AdminInventoryHealthDto {
  @ApiProperty() lowStock!: number;
  @ApiProperty() outOfStock!: number;
  @ApiProperty() activeProducts!: number;
}

export class AdminDeliveryHealthDto {
  @ApiProperty({ nullable: true, type: Number }) avgDays!: number | null;
  @ApiProperty({ type: [AnalyticsDeliveryBucketDto] }) buckets!: AnalyticsDeliveryBucketDto[];
}

export class AdminRatingsHealthDto {
  @ApiProperty({ type: String }) avg!: string;
  @ApiProperty() count!: number;
  @ApiProperty({ type: [AnalyticsRatingDistributionRowDto] })
  distribution!: AnalyticsRatingDistributionRowDto[];
}

export class AdminPanelsDto {
  @ApiProperty({ type: Object, example: { from: "2026-08-24T00:00:00.000Z" } })
  range!: { from: string; to: string };
  @ApiProperty({ type: Object }) previousRange!: { from: string; to: string };
  @ApiProperty({ description: "day | week | month (series bucket size)" })
  bucket!: "day" | "week" | "month";
  @ApiProperty({ type: AdminPanelsKpisDto }) kpis!: AdminPanelsKpisDto;
  @ApiProperty({ type: [AnalyticsSeriesPointDto] }) series!: AnalyticsSeriesPointDto[];
  @ApiProperty({ type: [AnalyticsCountRowDto] }) ordersByStatus!: AnalyticsCountRowDto[];
  @ApiProperty({ type: [AnalyticsCountRowDto] }) paymentMix!: AnalyticsCountRowDto[];
  @ApiProperty({ type: AdminVerificationAgingDto })
  verification!: AdminVerificationAgingDto;
  @ApiProperty({ type: AdminDisputesHealthDto }) disputes!: AdminDisputesHealthDto;
  @ApiProperty({ type: AdminRefundsHealthDto }) refunds!: AdminRefundsHealthDto;
  @ApiProperty({ type: AdminWithdrawalsHealthDto }) withdrawals!: AdminWithdrawalsHealthDto;
  @ApiProperty({ type: AdminReconciliationHealthDto }) reconciliation!: AdminReconciliationHealthDto;
  @ApiProperty({ type: AdminInventoryHealthDto }) inventory!: AdminInventoryHealthDto;
  @ApiProperty({ type: AdminRatingsHealthDto }) ratings!: AdminRatingsHealthDto;
  @ApiProperty({ type: AdminDeliveryHealthDto }) delivery!: AdminDeliveryHealthDto;
  @ApiProperty({ type: [AnalyticsTopShopDto] }) topShops!: AnalyticsTopShopDto[];
  @ApiProperty({ type: [AnalyticsTopProductDto] }) topProducts!: AnalyticsTopProductDto[];
  @ApiProperty({ type: [AnalyticsTopCategoryDto] }) topCategories!: AnalyticsTopCategoryDto[];
  @ApiProperty({ type: [AnalyticsCountRowDto] }) topDistricts!: AnalyticsCountRowDto[];
}

export class SellerPanelsKpisDto {
  @ApiProperty({ type: AnalyticsMetricDto }) revenue!: AnalyticsMetricDto;
  @ApiProperty({ type: AnalyticsMetricDto }) orders!: AnalyticsMetricDto;
  @ApiProperty({ type: AnalyticsMetricDto }) aov!: AnalyticsMetricDto;
  @ApiProperty({ type: AnalyticsMetricDto }) deliveredOrders!: AnalyticsMetricDto;
  @ApiProperty({ type: AnalyticsMetricDto }) commission!: AnalyticsMetricDto;
  @ApiProperty({ type: AnalyticsMetricDto }) cancelledOrders!: AnalyticsMetricDto;
}

export class SellerWalletSnapshotDto {
  @ApiProperty({ type: String }) available!: string;
  @ApiProperty({ type: String }) pending!: string;
  @ApiProperty({ type: String }) onHold!: string;
  @ApiProperty({ type: String }) withdrawalReserved!: string;
  @ApiProperty({ type: String }) totalWithdrawn!: string;
  @ApiProperty({ type: String }) codDues!: string;
  @ApiProperty({ type: String }) codDuesLimit!: string;
  @ApiProperty({ type: String }) net!: string;
}

export class SellerReleasePointDto {
  @ApiProperty({ example: "2026-11-25" }) bucket!: string;
  @ApiProperty({ type: String }) amount!: string;
  @ApiProperty() count!: number;
}

export class SellerDisputesHealthDto {
  @ApiProperty() open!: number;
  @ApiProperty() evidenceDueSoon!: number;
  @ApiProperty({ nullable: true, type: Number }) avgResolutionHours!: number | null;
  @ApiProperty({ type: [AnalyticsCountRowDto] }) byStatus!: AnalyticsCountRowDto[];
}

export class SellerWithdrawalsHealthDto {
  @ApiProperty() pendingCount!: number;
  @ApiProperty({ type: String }) pendingAmount!: string;
  @ApiProperty() paidCount!: number;
  @ApiProperty({ type: String }) paidAmount!: string;
  @ApiProperty({ nullable: true, type: Number }) avgTurnaroundHours!: number | null;
}

export class SellerPanelsDto {
  @ApiProperty({ type: Object }) range!: { from: string; to: string };
  @ApiProperty({ type: Object }) previousRange!: { from: string; to: string };
  @ApiProperty({ enum: ["day", "week", "month"] }) bucket!: "day" | "week" | "month";
  @ApiProperty({ type: SellerPanelsKpisDto }) kpis!: SellerPanelsKpisDto;
  @ApiProperty({ type: [SellerAnalyticsSeriesPointDto] })
  series!: SellerAnalyticsSeriesPointDto[];
  @ApiProperty({ type: [AnalyticsCountRowDto] }) ordersByStatus!: AnalyticsCountRowDto[];
  @ApiProperty({ type: [AnalyticsCountRowDto] }) paymentMix!: AnalyticsCountRowDto[];
  @ApiProperty({ type: SellerWalletSnapshotDto }) wallet!: SellerWalletSnapshotDto;
  @ApiProperty({ type: [SellerReleasePointDto] }) releaseTimeline!: SellerReleasePointDto[];
  @ApiProperty({ type: [AnalyticsTopProductDto] }) topProducts!: AnalyticsTopProductDto[];
  @ApiProperty({ type: AdminInventoryHealthDto })
  inventory!: AdminInventoryHealthDto;
  @ApiProperty({ type: AdminRatingsHealthDto }) ratings!: AdminRatingsHealthDto;
  @ApiProperty({ type: SellerDisputesHealthDto }) disputes!: SellerDisputesHealthDto;
  @ApiProperty({ type: SellerWithdrawalsHealthDto }) withdrawals!: SellerWithdrawalsHealthDto;
  @ApiProperty({ type: AdminDeliveryHealthDto }) delivery!: AdminDeliveryHealthDto;
}
