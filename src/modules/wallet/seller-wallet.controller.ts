import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Put, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { getRequestMeta } from "../../common/utils/request-meta";
import { Role } from "../../generated/prisma/enums";
import { QueryLedgerDto } from "../ledger/dto/query-ledger.dto";
import { PayoutProfileDto, QueryWithdrawalsDto, WithdrawalRequestDto } from "./dto/wallet.dto";
import { WalletService } from "./wallet.service";

@ApiTags("Seller: wallet")
@Roles(Role.SELLER)
@Controller("seller/wallet")
export class SellerWalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  @ApiOperation({ summary: "Wallet balances, pending release dates and profile" })
  summary(@CurrentUser("id") userId: string) {
    return this.wallet.wallet(userId);
  }

  @Get("transactions")
  @ApiOperation({ summary: "Wallet ledger transactions" })
  transactions(@CurrentUser("id") userId: string, @Query() query: QueryLedgerDto) {
    return this.wallet.transactions(userId, query);
  }

  @Get("payout-profile")
  @ApiOperation({ summary: "Get the seller payout profile (masked)" })
  profile(@CurrentUser("id") userId: string) {
    return this.wallet.profile(userId);
  }

  @Put("payout-profile")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Create or change the payout profile (cooldown applies)" })
  updateProfile(
    @CurrentUser("id") userId: string,
    @Body() dto: PayoutProfileDto,
    @Req() request: Request,
  ) {
    return this.wallet.saveProfile(userId, dto, getRequestMeta(request));
  }

  @Get("withdrawals")
  @ApiOperation({ summary: "List the seller's withdrawal requests" })
  list(@CurrentUser("id") userId: string, @Query() query: QueryWithdrawalsDto) {
    return this.wallet.listMine(userId, query);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("withdrawals")
  @ApiOperation({ summary: "Request a withdrawal (reserves the amount immediately)" })
  request(
    @CurrentUser("id") userId: string,
    @Body() dto: WithdrawalRequestDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: Request,
  ) {
    return this.wallet.requestWithdrawal(userId, dto, idempotencyKey, getRequestMeta(request));
  }
}
