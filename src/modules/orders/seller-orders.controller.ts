import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { SellerApprovedGuard } from "../../common/guards/seller-approved.guard";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { Role } from "../../generated/prisma/enums";
import { RespondCancellationDto } from "./dto/cancellation-request.dto";
import { QueryOrdersDto } from "./dto/query-orders.dto";
import { TransitionOrderDto } from "./dto/transition-order.dto";
import { OrdersService } from "./orders.service";

@ApiTags("Seller: orders")
@Roles(Role.SELLER)
@UseGuards(SellerApprovedGuard)
@Controller("seller")
export class SellerOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get("orders")
  @ApiOperation({ summary: "List the seller's shop orders" })
  list(@CurrentUser("id") sellerUserId: string, @Query() query: QueryOrdersDto) {
    return this.ordersService.listSellerOrders(sellerUserId, query);
  }

  @Get("orders/:id")
  @ApiOperation({ summary: "Get one of the seller's shop orders" })
  get(@CurrentUser("id") sellerUserId: string, @Param("id") id: string) {
    return this.ordersService.getSellerOrder(sellerUserId, id);
  }

  @Post("orders/:id/status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Advance a shop order's status" })
  setStatus(
    @CurrentUser("id") sellerUserId: string,
    @Param("id") id: string,
    @Body() dto: TransitionOrderDto,
  ) {
    return this.ordersService.transitionBySeller(sellerUserId, id, dto);
  }

  @Get("cancellation-requests")
  @ApiOperation({ summary: "List cancellation requests for the seller's shop" })
  listCancellations(@CurrentUser("id") sellerUserId: string, @Query() query: QueryOrdersDto) {
    return this.ordersService.listSellerCancellationRequests(sellerUserId, query);
  }

  @Post("cancellation-requests/:id/respond")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve or reject a cancellation request" })
  respond(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: RespondCancellationDto,
  ) {
    return this.ordersService.respondCancellation(actor, id, dto);
  }
}
