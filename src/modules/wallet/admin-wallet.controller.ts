import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { getRequestMeta } from "../../common/utils/request-meta";
import { Role } from "../../generated/prisma/enums";
import { PayWithdrawalDto, QueryWithdrawalsDto, RejectWithdrawalDto } from "./dto/wallet.dto";
import { WalletService } from "./wallet.service";

@ApiTags("Admin: withdrawals")
@Roles(Role.ADMIN)
@Controller("admin/withdrawals")
export class AdminWalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @ApiOperation({ summary: "Withdrawal payout queue" })
  list(@Query() query: QueryWithdrawalsDto) {
    return this.wallet.listForAdmin(query);
  }

  @Post(":id/pay")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark a withdrawal paid and record the transaction reference" })
  pay(
    @Param("id") id: string,
    @Body() dto: PayWithdrawalDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.wallet.markPaid(id, dto, actor, getRequestMeta(request));
  }

  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reject a withdrawal and return the reserved amount" })
  reject(
    @Param("id") id: string,
    @Body() dto: RejectWithdrawalDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.wallet.reject(id, dto, actor, getRequestMeta(request));
  }
}
