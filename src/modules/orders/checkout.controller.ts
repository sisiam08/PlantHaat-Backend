import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { ApiEnvelopeResponse } from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { CheckoutDto } from "./dto/checkout.dto";
import { OrderDetailDto } from "./dto/order-response.dto";
import { OrdersService } from "./orders.service";

@ApiTags("Checkout")
@Roles(Role.CUSTOMER)
@Controller()
export class CheckoutController {
  constructor(private readonly ordersService: OrdersService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("checkout")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "Idempotency-Key", required: true, description: "A UUID for this checkout" })
  @ApiOperation({ summary: "Place an order from the cart (COD only in v1)" })
  @ApiEnvelopeResponse(OrderDetailDto)
  checkout(
    @CurrentUser("id") customerId: string,
    @Body() dto: CheckoutDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    return this.ordersService.checkout(customerId, dto, idempotencyKey);
  }
}
