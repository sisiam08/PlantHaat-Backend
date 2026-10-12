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
  Req,
} from "@nestjs/common";
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiEnvelopeArrayResponse,
  ApiEnvelopeResponse,
} from "../../common/swagger/api-response.decorators";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { getRequestMeta } from "../../common/utils/request-meta";
import { Role } from "../../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { AdminCategoryDto } from "./dto/admin-response.dto";
import { AdminCategoriesService } from "./admin-categories.service";
import { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

@ApiTags("Admin: categories")
@Roles(Role.ADMIN)
@Controller("admin/categories")
export class AdminCategoriesController {
  constructor(
    private readonly categories: AdminCategoriesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List all categories (including inactive)" })
  @ApiEnvelopeArrayResponse(AdminCategoryDto)
  list() {
    return this.categories.list();
  }

  @Post()
  @ApiOperation({ summary: "Create a category" })
  @ApiEnvelopeResponse(AdminCategoryDto, { status: 201 })
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const category = await this.categories.create(dto);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "category.create",
      entityType: "Category",
      entityId: category.id,
      after: { name: category.name, slug: category.slug },
      ...getRequestMeta(request),
    });
    return category;
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a category" })
  @ApiEnvelopeResponse(AdminCategoryDto)
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const category = await this.categories.update(id, dto);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "category.update",
      entityType: "Category",
      entityId: id,
      ...getRequestMeta(request),
    });
    return category;
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a category (must have no products)" })
  @ApiNoContentResponse({ description: "Category deleted" })
  async remove(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.categories.remove(id);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "category.delete",
      entityType: "Category",
      entityId: id,
      ...getRequestMeta(request),
    });
  }
}
