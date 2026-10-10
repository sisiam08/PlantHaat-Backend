import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import { CheckoutDto } from "./dto/checkout.dto";
import { OrdersService } from "./orders.service";

@ApiTags("Checkout")
@Roles(Role.CUSTOMER)
@Controller()
export class CheckoutController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post("checkout")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "A UUID for this checkout" })
  @ApiOperation({ summary: "Place an order from the cart (COD only in v1)" })
  checkout(
    @CurrentUser("id") customerId: string,
    @Body() dto: CheckoutDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.ordersService.checkout(customerId, dto, idempotencyKey);
  }
}
