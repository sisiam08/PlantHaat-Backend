import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Roles } from "../../common/decorators/roles.decorator";
import { ApiPaginatedResponse } from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { QueryStuckOrdersDto } from "./dto/query-stuck-orders.dto";
import { StuckOrderDto } from "./dto/stuck-order-response.dto";
import { OrdersService } from "./orders.service";

@ApiTags("Admin: orders")
@Roles(Role.ADMIN)
@Controller("admin/stuck-orders")
export class AdminStuckOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: "List stuck orders (reminder/flag state, overdue by default)" })
  @ApiPaginatedResponse(StuckOrderDto)
  list(@Query() query: QueryStuckOrdersDto) {
    return this.orders.listStuckOrders(query);
  }
}
