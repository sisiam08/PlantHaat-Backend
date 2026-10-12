import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import type { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../../common/swagger/api-response.decorators";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { getRequestMeta } from "../../common/utils/request-meta";
import { Role } from "../../generated/prisma/enums";
import { AdminSellerDetailDto, AdminSellerListItemDto } from "./dto/admin-response.dto";
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
  @ApiPaginatedResponse(AdminSellerListItemDto)
  list(@Query() query: QuerySellersDto) {
    return this.adminSellers.list(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a seller application with documents and payout accounts" })
  @ApiEnvelopeResponse(AdminSellerDetailDto)
  get(@Param("id") id: string) {
    return this.adminSellers.get(id);
  }

  @Post(":id/approve")
  @ApiOperation({ summary: "Approve a seller (activates the shop)" })
  @ApiEnvelopeResponse(AdminSellerDetailDto)
  approve(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminSellers.approve(id, actor, getRequestMeta(request));
  }

  @Post(":id/reject")
  @ApiOperation({ summary: "Reject a seller application" })
  @ApiEnvelopeResponse(AdminSellerDetailDto)
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
  @ApiEnvelopeResponse(AdminSellerDetailDto)
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
  @ApiEnvelopeResponse(AdminSellerDetailDto)
  reactivate(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminSellers.reactivate(id, actor, getRequestMeta(request));
  }

  @Get(":id/documents/:docId")
  @ApiOperation({ summary: "Stream a seller document (private)" })
  @ApiOkResponse({
    description:
      "The document file (binary); an S3-compatible driver redirects to a short-lived presigned URL instead",
    schema: { type: "string", format: "binary" },
  })
  async getDocument(
    @Param("id") id: string,
    @Param("docId") docId: string,
    @Res() response: Response,
  ) {
    const location = await this.adminSellers.getDocumentPath(id, docId);
    // Local driver returns an absolute path (streamed); an S3-compatible driver
    // returns a short-lived presigned URL (redirected to).
    if (/^https?:\/\//.test(location)) {
      response.redirect(location);
      return;
    }
    response.sendFile(location);
  }
}
