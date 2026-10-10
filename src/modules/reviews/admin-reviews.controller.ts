import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { Role } from "../../generated/prisma/enums";
import { QueryReviewsDto, ResolveReviewReportDto } from "./dto/review.dto";
import { ReviewsService } from "./reviews.service";

@ApiTags("Admin: reviews")
@Roles(Role.ADMIN)
@Controller("admin")
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get("review-reports")
  @ApiOperation({ summary: "List review reports" })
  listReports(@Query() query: QueryReviewsDto) {
    return this.reviewsService.listReports(query);
  }

  @Post("review-reports/:id/resolve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resolve a review report (hide or keep)" })
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
  hide(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.reviewsService.setVisibility(id, false, actor);
  }

  @Post("reviews/:id/unhide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Unhide a review" })
  unhide(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.reviewsService.setVisibility(id, true, actor);
  }
}
