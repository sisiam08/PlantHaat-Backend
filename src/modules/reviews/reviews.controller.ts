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
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import { CreateReviewDto, QueryReviewsDto, UpdateReviewDto } from "./dto/review.dto";
import { ReviewsService } from "./reviews.service";

@ApiTags("Reviews")
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Public()
  @Get("products/:slug/reviews")
  @ApiOperation({ summary: "List visible reviews for a product" })
  listForProduct(@Param("slug") slug: string, @Query() query: QueryReviewsDto) {
    return this.reviewsService.listForProduct(slug, query);
  }

  @Roles(Role.CUSTOMER)
  @Post("orders/items/:orderItemId/review")
  @ApiOperation({ summary: "Review a delivered order item" })
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
  async remove(@CurrentUser("id") customerId: string, @Param("id") id: string) {
    await this.reviewsService.remove(customerId, id);
  }
}
