import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { getRequestMeta } from "../../common/utils/request-meta";
import { Role } from "../../generated/prisma/enums";
import { AdminSellersService } from "./admin-sellers.service";
import { QuerySellersDto } from "./dto/query-sellers.dto";
import { RejectSellerDto } from "./dto/reject-seller.dto";
import { SuspendDto } from "./dto/suspend.dto";

@ApiTags("Admin: sellers")
@Roles(Role.ADMIN)
@Controller("admin/sellers")
export class AdminSellersController {
  constructor(private readonly adminSellers: AdminSellersService) {}

  @Get()
  @ApiOperation({ summary: "List seller applications" })
  list(@Query() query: QuerySellersDto) {
    return this.adminSellers.list(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a seller application with documents and payout accounts" })
  get(@Param("id") id: string) {
    return this.adminSellers.get(id);
  }

  @Post(":id/approve")
  @ApiOperation({ summary: "Approve a seller (activates the shop)" })
  approve(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminSellers.approve(id, actor, getRequestMeta(request));
  }

  @Post(":id/reject")
  @ApiOperation({ summary: "Reject a seller application" })
  reject(
    @Param("id") id: string,
    @Body() dto: RejectSellerDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminSellers.reject(id, dto.reason, actor, getRequestMeta(request));
  }

  @Post(":id/suspend")
  @ApiOperation({ summary: "Suspend a seller and their shop" })
  suspend(
    @Param("id") id: string,
    @Body() dto: SuspendDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminSellers.suspend(id, dto.reason, actor, getRequestMeta(request));
  }

  @Post(":id/reactivate")
  @ApiOperation({ summary: "Reactivate a suspended seller" })
  reactivate(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminSellers.reactivate(id, actor, getRequestMeta(request));
  }

  @Get(":id/documents/:docId")
  @ApiOperation({ summary: "Stream a seller document (private)" })
  async getDocument(
    @Param("id") id: string,
    @Param("docId") docId: string,
    @Res() response: Response,
  ) {
    const filePath = await this.adminSellers.getDocumentPath(id, docId);
    response.sendFile(filePath);
  }
}
