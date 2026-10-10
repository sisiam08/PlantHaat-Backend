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
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { getRequestMeta } from "../../common/utils/request-meta";
import { Role } from "../../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
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
  list() {
    return this.categories.list();
  }

  @Post()
  @ApiOperation({ summary: "Create a category" })
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
