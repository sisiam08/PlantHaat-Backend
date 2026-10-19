import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
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
import { CodRiskService } from "./cod-risk.service";
import {
  QueryCodRiskDto,
  SetCodRiskStatusDto,
  SetCodRiskWhitelistDto,
} from "./dto/cod-risk.dto";
import { CodRiskProfileDto } from "./dto/cod-risk-response.dto";

@ApiTags("Admin: COD risk")
@Roles(Role.ADMIN)
@Controller("admin/cod-risk")
export class CodRiskController {
  constructor(private readonly codRisk: CodRiskService) {}

  @Get()
  @ApiOperation({ summary: "List COD risk profiles (phones are unverified)" })
  @ApiPaginatedResponse(CodRiskProfileDto)
  list(@Query() query: QueryCodRiskDto) {
    return this.codRisk.list(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a COD risk profile" })
  @ApiEnvelopeResponse(CodRiskProfileDto)
  get(@Param("id") id: string) {
    return this.codRisk.get(id);
  }

  @Post(":id/status")
  @ApiOperation({ summary: "Set the COD risk status (audit-logged)" })
  @ApiEnvelopeResponse(CodRiskProfileDto)
  setStatus(
    @Param("id") id: string,
    @Body() dto: SetCodRiskStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.codRisk.setStatus(id, dto, actor, getRequestMeta(request));
  }

  @Post(":id/whitelist")
  @ApiOperation({ summary: "Whitelist/unwhitelist a phone for COD (audit-logged)" })
  @ApiEnvelopeResponse(CodRiskProfileDto)
  setWhitelist(
    @Param("id") id: string,
    @Body() dto: SetCodRiskWhitelistDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.codRisk.setWhitelist(id, dto, actor, getRequestMeta(request));
  }
}
