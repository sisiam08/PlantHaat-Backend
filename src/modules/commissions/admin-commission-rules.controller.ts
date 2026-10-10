import {
  Body,
  Controller,
  Delete,
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
import { CommissionsService } from "./commissions.service";
import {
  CreateCommissionRuleDto,
  QueryCommissionRulesDto,
  UpdateCommissionRuleDto,
} from "./dto/commission-rule.dto";

@ApiTags("Admin: commission rules")
@Roles(Role.ADMIN)
@Controller("admin/commission-rules")
export class AdminCommissionRulesController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get()
  @ApiOperation({ summary: "List commission rules" })
  list(@Query() query: QueryCommissionRulesDto) {
    return this.commissions.listRules(query);
  }

  @Post()
  @ApiOperation({ summary: "Create a commission rule" })
  create(
    @Body() dto: CreateCommissionRuleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.commissions.createRule(dto, actor, getRequestMeta(request));
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a commission rule" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateCommissionRuleDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.commissions.updateRule(id, dto, actor, getRequestMeta(request));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a commission rule" })
  async remove(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.commissions.removeRule(id, actor, getRequestMeta(request));
  }
}
