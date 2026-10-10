import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import { PayoutsService } from "./payouts.service";

@ApiTags("Seller: earnings")
@Roles(Role.SELLER)
@Controller("seller")
export class SellerEarningsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get("earnings")
  @ApiOperation({ summary: "Seller balance, ledger and payouts" })
  earnings(@CurrentUser("id") userId: string) {
    return this.payouts.sellerEarnings(userId);
  }
}
