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
import { AdminShopsService } from "./admin-shops.service";
import { QueryShopsDto } from "./dto/query-shops.dto";
import { SuspendDto } from "./dto/suspend.dto";

@ApiTags("Admin: shops")
@Roles(Role.ADMIN)
@Controller("admin/shops")
export class AdminShopsController {
  constructor(private readonly adminShops: AdminShopsService) {}

  @Get()
  @ApiOperation({ summary: "List shops" })
  list(@Query() query: QueryShopsDto) {
    return this.adminShops.list(query);
  }

  @Post(":id/suspend")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Suspend a shop" })
  async suspend(
    @Param("id") id: string,
    @Body() dto: SuspendDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.adminShops.suspend(id, dto.reason, actor, getRequestMeta(request));
    return { suspended: true };
  }

  @Post(":id/reactivate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reactivate a shop" })
  async reactivate(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.adminShops.reactivate(id, actor, getRequestMeta(request));
    return { reactivated: true };
  }
}
