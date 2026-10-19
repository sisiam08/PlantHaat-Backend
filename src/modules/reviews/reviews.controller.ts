import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiAdaptivePaginatedResponse,
  ApiEnvelopeResponse,
} from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { CreateReviewDto, QueryProductReviewsDto, UpdateReviewDto } from "./dto/review.dto";
import { ProductReviewListItemDto, ReviewDto } from "./dto/review-response.dto";
import { ReviewsService } from "./reviews.service";

@ApiTags("Reviews")
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get("products/:slug/reviews")
  @ApiOperation({
    summary: "List visible reviews for a product",
    description:
      "Offset pagination by default (meta adds `average` + `distribution`); " +
      "`pagination=cursor` pages by (createdAt,id) for `newest` and by (rating,createdAt,id) " +
      "for `highest`/`lowest`. Filters: `rating` (1-5), `withPhotos`, `sort`.",
  })
  @ApiAdaptivePaginatedResponse(ProductReviewListItemDto)
  listForProduct(@Param("slug") slug: string, @Query() query: QueryProductReviewsDto) {
    return this.reviewsService.listForProduct(slug, query);
  }

  @Roles(Role.CUSTOMER)
  @Post("orders/items/:orderItemId/review")
  @ApiOperation({ summary: "Review a delivered order item" })
  @ApiEnvelopeResponse(ReviewDto, { status: 201 })
  create(
    @CurrentUser("id") customerId: string,
    @Param("orderItemId") orderItemId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(customerId, orderItemId, dto);
  }

  @Roles(Role.CUSTOMER)
  @Patch("reviews/:id")
  @ApiOperation({ summary: "Edit your review (within 7 days)" })
  @ApiEnvelopeResponse(ReviewDto)
  update(
    @CurrentUser("id") customerId: string,
    @Param("id") id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.update(customerId, id, dto);
  }

  @Roles(Role.CUSTOMER)
  @Delete("reviews/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete your review" })
  @ApiNoContentResponse({ description: "Review deleted" })
  async remove(@CurrentUser("id") customerId: string, @Param("id") id: string) {
    await this.reviewsService.remove(customerId, id);
  }
}
