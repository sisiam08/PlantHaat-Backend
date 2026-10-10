import { ApiProperty } from "@nestjs/swagger";

export class SellerDashboardDto {
  @ApiProperty() pendingOrders!: number;
  @ApiProperty() unreadNotifications!: number;
  @ApiProperty() lowStockVariants!: number;
}

export class SellerEarningsDto {
  @ApiProperty({ type: String, description: "Decimal as string (positive = owed to seller)" })
  balance!: string;
  @ApiProperty({ type: [Object] }) ledger!: Record<string, unknown>[];
  @ApiProperty({ type: [Object] }) payouts!: Record<string, unknown>[];
}

export class AnalyticsOverviewDto {
  @ApiProperty({ type: String, format: "date-time" }) from!: string;
  @ApiProperty({ type: String, format: "date-time" }) to!: string;
  @ApiProperty({ type: Object, description: "Aggregated metrics (shape varies by audience)" })
  metrics!: Record<string, unknown>;
}
