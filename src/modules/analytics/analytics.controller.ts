import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { ApiEnvelopeResponse } from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { AnalyticsService } from "./analytics.service";
import { AdminPanelsDto, SellerPanelsDto } from "./dto/analytics-panels.dto";
import {
  AdminAnalyticsOverviewDto,
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

  @Get("analytics/panels")
  @ApiOperation({ summary: "Seller dashboard panels (read-only aggregated series)" })
  @ApiEnvelopeResponse(SellerPanelsDto)
  panels(@CurrentUser("id") userId: string, @Query() query: AnalyticsRangeDto) {
    return this.analytics.sellerPanels(userId, query);
  }
}

@ApiTags("Admin: analytics")
@Roles(Role.ADMIN)
@Controller("admin/analytics")
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("overview")
  @ApiOperation({ summary: "Admin analytics overview" })
  @ApiEnvelopeResponse(AdminAnalyticsOverviewDto)
  overview(@Query() query: AnalyticsRangeDto) {
    return this.analytics.adminOverview(query);
  }

  @Get("panels")
  @ApiOperation({ summary: "Admin dashboard panels (read-only aggregated series)" })
  @ApiEnvelopeResponse(AdminPanelsDto)
  panels(@Query() query: AnalyticsRangeDto) {
    return this.analytics.adminPanels(query);
  }
}
