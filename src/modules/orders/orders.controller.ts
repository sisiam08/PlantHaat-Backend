import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { ApiEnvelopeResponse } from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { CancelOrderDto } from "./dto/cancel-order.dto";
import { OrderDetailDto } from "./dto/order-response.dto";
import { CancellationRequestDto } from "./dto/cancellation-request.dto";
import { QueryOrdersDto } from "./dto/query-orders.dto";
import { OrdersService } from "./orders.service";

@ApiTags("Orders")
@Roles(Role.CUSTOMER)
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: "List the current customer's orders" })
  list(@CurrentUser("id") customerId: string, @Query() query: QueryOrdersDto) {
    return this.ordersService.listCustomerOrders(customerId, query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one of the current customer's orders" })
  @ApiEnvelopeResponse(OrderDetailDto)
  get(@CurrentUser("id") customerId: string, @Param("id") id: string) {
    return this.ordersService.getCustomerOrder(customerId, id);
  }

  @Post("shop-orders/:id/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel a shop order while it is still PENDING" })
  cancel(
    @CurrentUser("id") customerId: string,
    @Param("id") id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancelByCustomer(customerId, id, dto);
  }

  @Post("shop-orders/:id/cancellation-request")
  @ApiOperation({ summary: "Request cancellation of a CONFIRMED/PACKED shop order" })
  requestCancellation(
    @CurrentUser("id") customerId: string,
    @Param("id") id: string,
    @Body() dto: CancellationRequestDto,
  ) {
    return this.ordersService.createCancellationRequest(customerId, id, dto);
  }
}
