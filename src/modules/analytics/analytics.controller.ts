import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { ApiEnvelopeResponse } from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { AnalyticsService } from "./analytics.service";
import {
  AnalyticsOverviewDto,
  SellerDashboardDto,
} from "./dto/analytics-response.dto";
import { AnalyticsRangeDto } from "./dto/analytics-range.dto";

@ApiTags("Seller: analytics")
@Roles(Role.SELLER)
@Controller("seller")
export class SellerAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("analytics/overview")
  @ApiOperation({ summary: "Seller analytics overview" })
  @ApiEnvelopeResponse(AnalyticsOverviewDto)
  overview(@CurrentUser("id") userId: string, @Query() query: AnalyticsRangeDto) {
    return this.analytics.sellerOverview(userId, query);
  }

  @Get("dashboard")
  @ApiOperation({ summary: "Seller dashboard counters" })
  @ApiEnvelopeResponse(SellerDashboardDto)
  dashboard(@CurrentUser("id") userId: string) {
    return this.analytics.sellerDashboard(userId);
  }
}

@ApiTags("Admin: analytics")
@Roles(Role.ADMIN)
@Controller("admin/analytics")
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("overview")
  @ApiOperation({ summary: "Admin analytics overview" })
  @ApiEnvelopeResponse(AnalyticsOverviewDto)
  overview(@Query() query: AnalyticsRangeDto) {
    return this.analytics.adminOverview(query);
  }
}
