import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { QueryReviewsDto, ReplyReviewDto, ReportReviewDto } from "./dto/review.dto";
import {
  ReviewDto,
  ReviewReportDto,
  SellerReviewListItemDto,
} from "./dto/review-response.dto";
import { ReviewsService } from "./reviews.service";

@ApiTags("Seller: reviews")
@Roles(Role.SELLER)
@Controller("seller")
export class SellerReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get("reviews")
  @ApiOperation({ summary: "List reviews for the seller's shop" })
  @ApiPaginatedResponse(SellerReviewListItemDto)
  list(@CurrentUser("id") sellerUserId: string, @Query() query: QueryReviewsDto) {
    return this.reviewsService.listForSeller(sellerUserId, query);
  }

  @Post("reviews/:id/reply")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reply to a review (one reply, editable)" })
  @ApiEnvelopeResponse(ReviewDto)
  reply(
    @CurrentUser("id") sellerUserId: string,
    @Param("id") id: string,
    @Body() dto: ReplyReviewDto,
  ) {
    return this.reviewsService.reply(sellerUserId, id, dto);
  }

  @Post("reviews/:id/report")
  @ApiOperation({ summary: "Report a review for admin moderation" })
  @ApiEnvelopeResponse(ReviewReportDto, { status: 201 })
  report(
    @CurrentUser("id") sellerUserId: string,
    @Param("id") id: string,
    @Body() dto: ReportReviewDto,
  ) {
    return this.reviewsService.report(sellerUserId, id, dto);
  }
}
