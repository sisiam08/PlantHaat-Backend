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
import { ComplaintsService } from "./complaints.service";
import {
  ComplaintCommentDto,
  QueryComplaintsDto,
  ResolveComplaintDto,
  UpdateComplaintStatusDto,
} from "./dto/complaint.dto";
import {
  AdminComplaintDetailDto,
  AdminComplaintListItemDto,
  ComplaintCommentResponseDto,
} from "./dto/complaint-response.dto";

@ApiTags("Admin: complaints")
@Roles(Role.ADMIN)
@Controller("admin/complaints")
export class AdminComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Get()
  @ApiOperation({ summary: "List all complaints" })
  @ApiPaginatedResponse(AdminComplaintListItemDto)
  list(@Query() query: QueryComplaintsDto) {
    return this.complaintsService.listAll(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get any complaint (includes internal notes)" })
  @ApiEnvelopeResponse(AdminComplaintDetailDto)
  get(@Param("id") id: string) {
    return this.complaintsService.getAny(id);
  }

  @Post(":id/status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change a complaint's status" })
  @ApiEnvelopeResponse(AdminComplaintDetailDto)
  status(
    @Param("id") id: string,
    @Body() dto: UpdateComplaintStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.complaintsService.updateStatus(id, dto, actor, getRequestMeta(request));
  }

  @Post(":id/resolve")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resolve a complaint (optionally creating a refund)" })
  @ApiEnvelopeResponse(AdminComplaintDetailDto)
  resolve(
    @Param("id") id: string,
    @Body() dto: ResolveComplaintDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.complaintsService.resolve(id, dto, actor, getRequestMeta(request));
  }

  @Post(":id/comment")
  @ApiOperation({ summary: "Add an admin comment (optionally internal)" })
  @ApiEnvelopeResponse(ComplaintCommentResponseDto, { status: 201 })
  comment(
    @Param("id") id: string,
    @Body() dto: ComplaintCommentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.complaintsService.addAdminComment(actor, id, dto);
  }
}
