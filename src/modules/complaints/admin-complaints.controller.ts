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
import { ComplaintsService } from "./complaints.service";
import {
  ComplaintCommentDto,
  QueryComplaintsDto,
  ResolveComplaintDto,
  UpdateComplaintStatusDto,
} from "./dto/complaint.dto";

@ApiTags("Admin: complaints")
@Roles(Role.ADMIN)
@Controller("admin/complaints")
export class AdminComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Get()
  @ApiOperation({ summary: "List all complaints" })
  list(@Query() query: QueryComplaintsDto) {
    return this.complaintsService.listAll(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get any complaint (includes internal notes)" })
  get(@Param("id") id: string) {
    return this.complaintsService.getAny(id);
  }

  @Post(":id/status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Change a complaint's status" })
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
  comment(
    @Param("id") id: string,
    @Body() dto: ComplaintCommentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.complaintsService.addAdminComment(actor, id, dto);
  }
}
