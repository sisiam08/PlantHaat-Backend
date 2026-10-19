import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../../common/swagger/api-response.decorators";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { Role } from "../../generated/prisma/enums";
import { QueryContentReportsDto, ResolveContentReportDto } from "./dto/qa.dto";
import {
  ContentModerationResultDto,
  ContentReportDto,
  ContentReportResolveDto,
} from "./dto/qa-response.dto";
import { QaService } from "./qa.service";

@ApiTags("Admin: content reports")
@Roles(Role.ADMIN)
@Controller("admin")
export class QaAdminController {
  constructor(private readonly qa: QaService) {}

  @Get("content-reports")
  @ApiOperation({ summary: "List content reports (questions, answers, replies, reviews)" })
  @ApiPaginatedResponse(ContentReportDto)
  listReports(@Query() query: QueryContentReportsDto) {
    return this.qa.listContentReports(query);
  }

  @Post("content-reports/:id/resolve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resolve a content report (hide or keep)" })
  @ApiEnvelopeResponse(ContentReportResolveDto)
  resolve(
    @Param("id") id: string,
    @Body() dto: ResolveContentReportDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.qa.resolveReport(id, dto.hide, actor);
  }

  @Post("questions/:id/hide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Hide a question" })
  @ApiEnvelopeResponse(ContentModerationResultDto)
  hideQuestion(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.qa.setVisibility("questions", id, false, actor);
  }

  @Post("questions/:id/unhide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Unhide a question" })
  @ApiEnvelopeResponse(ContentModerationResultDto)
  unhideQuestion(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.qa.setVisibility("questions", id, true, actor);
  }

  @Post("answers/:id/hide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Hide an answer" })
  @ApiEnvelopeResponse(ContentModerationResultDto)
  hideAnswer(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.qa.setVisibility("answers", id, false, actor);
  }

  @Post("answers/:id/unhide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Unhide an answer" })
  @ApiEnvelopeResponse(ContentModerationResultDto)
  unhideAnswer(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.qa.setVisibility("answers", id, true, actor);
  }

  @Post("replies/:id/hide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Hide a reply" })
  @ApiEnvelopeResponse(ContentModerationResultDto)
  hideReply(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.qa.setVisibility("replies", id, false, actor);
  }

  @Post("replies/:id/unhide")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Unhide a reply" })
  @ApiEnvelopeResponse(ContentModerationResultDto)
  unhideReply(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.qa.setVisibility("replies", id, true, actor);
  }
}
