import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { getRequestMeta } from "../../common/utils/request-meta";
import { Role } from "../../generated/prisma/enums";
import { QueryLedgerDto } from "../ledger/dto/query-ledger.dto";
import {
  AdjustmentDto,
  CreatePayoutDto,
  DuesPaymentDto,
  QueryPayoutsDto,
  UpdatePayoutDto,
} from "./dto/payout.dto";
import { PayoutsService } from "./payouts.service";

@ApiTags("Admin: payouts")
@Roles(Role.ADMIN)
@Controller("admin")
export class AdminPayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get("payouts")
  @ApiOperation({ summary: "List payouts" })
  list(@Query() query: QueryPayoutsDto) {
    return this.payouts.listPayouts(query);
  }

  @Post("payouts")
  @ApiOperation({ summary: "Record a manual payout to a seller" })
  create(
    @Body() dto: CreatePayoutDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.payouts.createPayout(dto, actor, getRequestMeta(request));
  }

  @Patch("payouts/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update a payout" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdatePayoutDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.payouts.updatePayout(id, dto, actor, getRequestMeta(request));
  }

  @Get("sellers/:id/ledger")
  @ApiOperation({ summary: "List a seller's ledger entries" })
  ledger(@Param("id") id: string, @Query() query: QueryLedgerDto) {
    return this.payouts.sellerLedger(id, query);
  }

  @Post("sellers/:id/dues-payments")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Record a seller dues payment (increases balance)" })
  dues(
    @Param("id") id: string,
    @Body() dto: DuesPaymentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.payouts.recordDuesPayment(id, dto, actor, getRequestMeta(request));
  }

  @Post("sellers/:id/adjustments")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Record a signed ledger adjustment" })
  adjust(
    @Param("id") id: string,
    @Body() dto: AdjustmentDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.payouts.recordAdjustment(id, dto, actor, getRequestMeta(request));
  }
}
