import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { SellerApprovedGuard } from "../../common/guards/seller-approved.guard";
import { Role } from "../../generated/prisma/enums";
import { PaymentsService } from "./payments.service";

@ApiTags("Seller: advance payment status")
@Roles(Role.SELLER)
@UseGuards(SellerApprovedGuard)
@Controller("seller")
export class SellerPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get("orders/:id/advance-payment")
  @ApiOperation({ summary: "Read-only advance payment status for one shop order" })
  status(@CurrentUser("id") sellerUserId: string, @Param("id") id: string) {
    return this.payments.sellerStatus(sellerUserId, id);
  }
}
