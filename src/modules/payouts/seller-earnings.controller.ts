import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { ApiEnvelopeResponse } from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { SellerEarningsDto } from "../analytics/dto/analytics-response.dto";
import { PayoutsService } from "./payouts.service";

@ApiTags("Seller: earnings")
@Roles(Role.SELLER)
@Controller("seller")
export class SellerEarningsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get("earnings")
  @ApiOperation({ summary: "Seller balance, ledger and payouts" })
  @ApiEnvelopeResponse(SellerEarningsDto)
  earnings(@CurrentUser("id") userId: string) {
    return this.payouts.sellerEarnings(userId);
  }
}
