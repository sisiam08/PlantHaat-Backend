import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Roles } from "../../common/decorators/roles.decorator";
import { ApiEnvelopeArrayResponse } from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { AdminSellersService } from "./admin-sellers.service";
import { SuspendedSellerOpenOrdersDto } from "./dto/admin-response.dto";

@ApiTags("Admin: sellers")
@Roles(Role.ADMIN)
@Controller("admin/suspended-sellers")
export class AdminSuspendedSellersController {
  constructor(private readonly adminSellers: AdminSellersService) {}

  @Get("open-orders")
  @ApiOperation({ summary: "Suspended sellers with their open shop orders" })
  @ApiEnvelopeArrayResponse(SuspendedSellerOpenOrdersDto)
  list() {
    return this.adminSellers.listSuspendedOpenOrders();
  }
}
