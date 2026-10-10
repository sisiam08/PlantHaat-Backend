import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import { WishlistService } from "./wishlist.service";

@ApiTags("Wishlist")
@Roles(Role.CUSTOMER)
@Controller("wishlist")
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  @ApiOperation({ summary: "List the customer's wishlist with availability" })
  list(@CurrentUser("id") userId: string, @Query() query: PaginationQueryDto) {
    return this.wishlistService.list(userId, query);
  }

  @Post(":productId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Add a product to the wishlist (idempotent)" })
  add(@CurrentUser("id") userId: string, @Param("productId") productId: string) {
    return this.wishlistService.add(userId, productId);
  }

  @Delete(":productId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a product from the wishlist" })
  async remove(@CurrentUser("id") userId: string, @Param("productId") productId: string) {
    await this.wishlistService.remove(userId, productId);
  }
}
