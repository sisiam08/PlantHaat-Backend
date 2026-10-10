import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import { CartService } from "./cart.service";
import { CartQueryDto } from "./dto/cart-query.dto";
import { PutCartItemDto } from "./dto/put-cart-item.dto";

@ApiTags("Cart")
@Roles(Role.CUSTOMER)
@Controller("cart")
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: "Get the cart grouped by shop (live prices and issues)" })
  get(@CurrentUser("id") userId: string, @Query() query: CartQueryDto) {
    return this.cartService.getCart(userId, query.districtId);
  }

  @Put("items")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set the quantity of a cart item" })
  putItem(@CurrentUser("id") userId: string, @Body() dto: PutCartItemDto) {
    return this.cartService.putItem(userId, dto);
  }

  @Delete("items/:variantId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a cart item" })
  removeItem(@CurrentUser("id") userId: string, @Param("variantId") variantId: string) {
    return this.cartService.removeItem(userId, variantId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Clear the cart" })
  clear(@CurrentUser("id") userId: string) {
    return this.cartService.clear(userId);
  }
}
