import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { ProcessRefundDto, QueryRefundsDto, RejectRefundDto } from "./dto/refund.dto";
import { RefundsService } from "./refunds.service";

@ApiTags("Admin: refunds")
@Roles(Role.ADMIN)
@Controller("admin/refunds")
export class AdminRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  @ApiOperation({ summary: "List refunds" })
  list(@Query() query: QueryRefundsDto) {
    return this.refunds.list(query);
  }

  @Post(":id/approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve a requested refund" })
  approve(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.refunds.approve(id, actor, getRequestMeta(request));
  }

  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reject a refund" })
  reject(
    @Param("id") id: string,
    @Body() dto: RejectRefundDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.refunds.reject(id, dto, actor, getRequestMeta(request));
  }

  @Post(":id/process")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Process a refund and adjust the ledger" })
  process(
    @Param("id") id: string,
    @Body() dto: ProcessRefundDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.refunds.process(id, dto, actor, getRequestMeta(request));
  }
}
