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
import { RespondCancellationDto } from "./dto/cancellation-request.dto";
import { OrderDetailDto } from "./dto/order-response.dto";
import { QueryOrdersDto } from "./dto/query-orders.dto";
import {
  CancellationRespondResultDto,
  SellerShopOrderDto,
} from "./dto/seller-order-response.dto";
import { TransitionOrderDto } from "./dto/transition-order.dto";
import { OrdersService } from "./orders.service";

@ApiTags("Admin: orders")
@Roles(Role.ADMIN)
@Controller("admin")
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get("orders")
  @ApiOperation({ summary: "List all shop orders" })
  @ApiPaginatedResponse(SellerShopOrderDto)
  list(@Query() query: QueryOrdersDto) {
    return this.ordersService.listAdminOrders(query);
  }

  @Get("orders/:id")
  @ApiOperation({ summary: "Get any shop order" })
  @ApiEnvelopeResponse(OrderDetailDto)
  get(@Param("id") id: string) {
    return this.ordersService.getAdminOrder(id);
  }

  @Post("orders/:id/status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Override a shop order's status" })
  @ApiEnvelopeResponse(SellerShopOrderDto)
  setStatus(@Param("id") id: string, @Body() dto: TransitionOrderDto) {
    return this.ordersService.transitionByAdmin(id, dto);
  }

  @Post("cancellation-requests/:id/respond")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Respond to any cancellation request" })
  @ApiEnvelopeResponse(CancellationRespondResultDto)
  respond(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: RespondCancellationDto,
  ) {
    return this.ordersService.respondCancellation(actor, id, dto);
  }
}
