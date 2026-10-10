import { ApiProperty } from "@nestjs/swagger";

import {
  LedgerEntryType,
  PayoutMethod,
  PayoutStatus,
} from "../../../generated/prisma/enums";

export class SellerDashboardDto {
  @ApiProperty() sellerProfileId!: string;
  @ApiProperty() pendingOrders!: number;
  @ApiProperty() unreadNotifications!: number;
  @ApiProperty() lowStockVariants!: number;
}

export class SellerLedgerEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty() sellerProfileId!: string;
  @ApiProperty({ nullable: true, type: String }) shopOrderId!: string | null;
  @ApiProperty({ nullable: true, type: String }) payoutId!: string | null;
  @ApiProperty({ enum: Object.values(LedgerEntryType) }) type!: LedgerEntryType;
  @ApiProperty({ type: String, description: "Decimal as string (positive = owed to seller)" })
  amount!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) createdById!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class SellerPayoutDto {
  @ApiProperty() id!: string;
  @ApiProperty() payoutNumber!: string;
  @ApiProperty() sellerProfileId!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) amount!: string;
  @ApiProperty({ enum: Object.values(PayoutStatus) }) status!: PayoutStatus;
  @ApiProperty({ nullable: true, enum: Object.values(PayoutMethod) }) method!: PayoutMethod | null;
  @ApiProperty({ nullable: true, type: String }) accountMasked!: string | null;
  @ApiProperty({ nullable: true, type: String }) reference!: string | null;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) periodFrom!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) periodTo!: string | null;
  @ApiProperty({ nullable: true, type: String }) processedById!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) processedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class SellerEarningsDto {
  @ApiProperty({ type: String, description: "Decimal as string (positive = owed to seller)" })
  balance!: string;
  @ApiProperty({ type: [SellerLedgerEntryDto] })
  ledger!: SellerLedgerEntryDto[];
  @ApiProperty({ type: [SellerPayoutDto] })
  payouts!: SellerPayoutDto[];
}

export class AnalyticsResolvedRangeDto {
  @ApiProperty({ type: String, format: "date-time" }) from!: string;
  @ApiProperty({ type: String, format: "date-time" }) to!: string;
}

export class SellerAnalyticsTopProductDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() soldCount!: number;
  @ApiProperty({ type: String, description: "Decimal as string" }) ratingAvg!: string;
}

export class SellerAnalyticsLowStockDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() stockQty!: number;
  @ApiProperty() lowStockThreshold!: number;
  @ApiProperty({ type: Object, example: { name: "Monstera Deliciosa" } })
  product!: { name: string };
}

export class SellerAnalyticsRatingDto {
  @ApiProperty({ type: String, description: "Decimal as string" }) avg!: string;
  @ApiProperty() count!: number;
}

export class SellerAnalyticsDailySeriesDto {
  @ApiProperty({ example: "2026-10-10" }) date!: string;
  @ApiProperty() orders!: number;
  @ApiProperty({ type: String, description: "Decimal as string" }) revenue!: string;
}

export class AnalyticsOverviewDto {
  @ApiProperty({ type: AnalyticsResolvedRangeDto }) range!: AnalyticsResolvedRangeDto;
  @ApiProperty() sellerProfileId!: string;
  @ApiProperty() shopId!: string;
  @ApiProperty({
    type: Object,
    additionalProperties: { type: "number" },
    example: { PENDING: 3, DELIVERED: 10 },
    description: "Order counts keyed by OrderStatus",
  })
  ordersByStatus!: Record<string, number>;
  @ApiProperty() deliveredOrders!: number;
  @ApiProperty({ type: String, description: "Decimal as string" }) revenue!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) commissionPaid!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) averageOrderValue!: string;
  @ApiProperty({ type: [SellerAnalyticsTopProductDto] })
  topProducts!: SellerAnalyticsTopProductDto[];
  @ApiProperty({ type: [SellerAnalyticsLowStockDto] })
  lowStock!: SellerAnalyticsLowStockDto[];
  @ApiProperty({ type: SellerAnalyticsRatingDto }) rating!: SellerAnalyticsRatingDto;
  @ApiProperty({ type: [SellerAnalyticsDailySeriesDto] })
  dailySeries!: SellerAnalyticsDailySeriesDto[];
}

export class AdminAnalyticsTopShopDto {
  @ApiProperty({
    nullable: true,
    type: Object,
    example: { id: "3f1c9b2e-0000-0000-0000-000000000000", name: "Green Valley", slug: "green-valley" },
  })
  shop!: { id: string; name: string; slug: string } | null;
  @ApiProperty({ type: String, description: "Decimal as string" }) total!: string;
}

export class AdminAnalyticsTopProductDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() soldCount!: number;
  @ApiProperty({ type: Object, example: { name: "Green Valley" } }) shop!: { name: string };
}

export class AdminAnalyticsTopDistrictDto {
  @ApiProperty() district!: string;
  @ApiProperty() count!: number;
}

export class AdminAnalyticsDailySeriesDto {
  @ApiProperty({ example: "2026-10-10" }) date!: string;
  @ApiProperty() orders!: number;
  @ApiProperty({ type: String, description: "Decimal as string" }) gmv!: string;
}

export class AdminAnalyticsOverviewDto {
  @ApiProperty({ type: AnalyticsResolvedRangeDto }) range!: AnalyticsResolvedRangeDto;
  @ApiProperty({ type: String, description: "Decimal as string" }) gmv!: string;
  @ApiProperty() orderCount!: number;
  @ApiProperty({ type: String, description: "Decimal as string" }) commissionEarned!: string;
  @ApiProperty() newCustomers!: number;
  @ApiProperty() newSellers!: number;
  @ApiProperty() pendingApprovals!: number;
  @ApiProperty({ description: "Percentage (0-100)" }) cancellationRate!: number;
  @ApiProperty({ description: "Percentage (0-100)" }) complaintRate!: number;
  @ApiProperty({ type: [AdminAnalyticsTopShopDto] })
  topShops!: AdminAnalyticsTopShopDto[];
  @ApiProperty({ type: [AdminAnalyticsTopProductDto] })
  topProducts!: AdminAnalyticsTopProductDto[];
  @ApiProperty({ type: [AdminAnalyticsTopDistrictDto] })
  topDistricts!: AdminAnalyticsTopDistrictDto[];
  @ApiProperty({ type: [AdminAnalyticsDailySeriesDto] })
  dailySeries!: AdminAnalyticsDailySeriesDto[];
}
