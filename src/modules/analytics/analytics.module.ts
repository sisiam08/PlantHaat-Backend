import { Module } from "@nestjs/common";

import { SellersModule } from "../sellers/sellers.module";
import { AdminAnalyticsController, SellerAnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

@Module({
  imports: [SellersModule],
  controllers: [SellerAnalyticsController, AdminAnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
