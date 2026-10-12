import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../../common/swagger/api-response.decorators";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { Role } from "../../generated/prisma/enums";
import { QueryReviewsDto, ResolveReviewReportDto } from "./dto/review.dto";
import {
  AdminReviewReportDto,
  ReviewModerationResultDto,
  ReviewReportResolveDto,
} from "./dto/review-response.dto";
import { ReviewsService } from "./reviews.service";

@ApiTags("Admin: reviews")
@Roles(Role.ADMIN)
@Controller("admin")
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get("review-reports")
  @ApiOperation({ summary: "List review reports" })
  @ApiPaginatedResponse(AdminReviewReportDto)
  listReports(@Query() query: QueryReviewsDto) {
    return this.reviewsService.listReports(query);
  }

  @Post("review-reports/:id/resolve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resolve a review report (hide or keep)" })
  @ApiEnvelopeResponse(ReviewReportResolveDto)
  resolve(
    @Param("id") id: string,
    @Body() dto: ResolveReviewReportDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.reviewsService.resolveReport(id, dto.hide, actor);
  }

  @Post("reviews/:id/hide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Hide a review" })
  @ApiEnvelopeResponse(ReviewModerationResultDto)
  hide(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.reviewsService.setVisibility(id, false, actor);
  }

  @Post("reviews/:id/unhide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Unhide a review" })
  @ApiEnvelopeResponse(ReviewModerationResultDto)
  unhide(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.reviewsService.setVisibility(id, true, actor);
  }
}
