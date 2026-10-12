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
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../../common/swagger/api-response.decorators";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { getRequestMeta } from "../../common/utils/request-meta";
import { Role } from "../../generated/prisma/enums";
import { AdminProductListItemDto, AdminProductStatusDto } from "./dto/admin-response.dto";
import { AdminProductsService } from "./admin-products.service";
import { QueryAdminProductsDto } from "./dto/query-admin-products.dto";
import { RejectSellerDto } from "./dto/reject-seller.dto";

@ApiTags("Admin: products")
@Roles(Role.ADMIN)
@Controller("admin/products")
export class AdminProductsController {
  constructor(private readonly adminProducts: AdminProductsService) {}

  @Get()
  @ApiOperation({ summary: "List products for moderation" })
  @ApiPaginatedResponse(AdminProductListItemDto)
  list(@Query() query: QueryAdminProductsDto) {
    return this.adminProducts.list(query);
  }

  @Post(":id/approve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Approve a product" })
  @ApiEnvelopeResponse(AdminProductStatusDto)
  approve(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminProducts.approve(id, actor, getRequestMeta(request));
  }

  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reject a product" })
  @ApiEnvelopeResponse(AdminProductStatusDto)
  reject(
    @Param("id") id: string,
    @Body() dto: RejectSellerDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminProducts.reject(id, dto.reason, actor, getRequestMeta(request));
  }

  @Post(":id/remove")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remove a product from the catalog" })
  @ApiEnvelopeResponse(AdminProductStatusDto)
  remove(
    @Param("id") id: string,
    @Body() dto: RejectSellerDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminProducts.remove(id, dto.reason, actor, getRequestMeta(request));
  }
}
