import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsObject } from "class-validator";
import type { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { getRequestMeta } from "../../common/utils/request-meta";
import { Role } from "../../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "./settings.service";

class UpdateSettingsDto {
  @IsObject()
  values!: Record<string, unknown>;
}

@ApiTags("Admin: settings")
@Roles(Role.ADMIN)
@Controller("admin/settings")
export class AdminSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get all system settings (merged with defaults)" })
  get() {
    return this.settings.getAll();
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update system settings" })
  async update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ) {
    const values = await this.settings.update(dto.values, actor.id);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "settings.update",
      entityType: "SystemSetting",
      after: dto.values,
      ...getRequestMeta(request),
    });
    return values;
  }
}
