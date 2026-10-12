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
import { AdminUserDetailDto, AdminUserListItemDto, AdminUserStatusDto } from "./dto/admin-response.dto";
import { AdminUsersService } from "./admin-users.service";
import { CreateAdminUserDto, QueryUsersDto } from "./dto/admin-users.dto";

@ApiTags("Admin: users")
@Roles(Role.ADMIN)
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @ApiOperation({ summary: "List users" })
  @ApiPaginatedResponse(AdminUserListItemDto)
  list(@Query() query: QueryUsersDto) {
    return this.adminUsers.list(query);
  }

  @Post()
  @ApiOperation({ summary: "Create an admin user" })
  @ApiEnvelopeResponse(AdminUserListItemDto, { status: 201 })
  create(
    @Body() dto: CreateAdminUserDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminUsers.createAdmin(dto, actor, getRequestMeta(request));
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a user" })
  @ApiEnvelopeResponse(AdminUserDetailDto)
  get(@Param("id") id: string) {
    return this.adminUsers.get(id);
  }

  @Post(":id/suspend")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Suspend a user and revoke their sessions" })
  @ApiEnvelopeResponse(AdminUserStatusDto)
  suspend(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminUsers.suspend(id, actor, getRequestMeta(request));
  }

  @Post(":id/reactivate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reactivate a user" })
  @ApiEnvelopeResponse(AdminUserStatusDto)
  reactivate(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.adminUsers.reactivate(id, actor, getRequestMeta(request));
  }
}
