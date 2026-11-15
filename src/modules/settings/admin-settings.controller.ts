import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsObject, IsString } from "class-validator";
import type { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { Roles } from "../../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { getRequestMeta } from "../../common/utils/request-meta";
import { Role } from "../../generated/prisma/enums";
import { AuditService } from "../audit/audit.service";
import { SettingsReauthService } from "./settings-reauth.service";
import { SettingsService } from "./settings.service";

class UpdateSettingsDto {
  @IsObject()
  values!: Record<string, unknown>;
}

class ReauthDto {
  @IsString()
  key!: string;

  @IsString()
  password!: string;
}

/** `{ success: true, data: { "<setting.key>": <json value>, ... } }` */
const settingsEnvelopeSchema = {
  type: "object",
  required: ["success", "data"],
  properties: {
    success: { type: "boolean", example: true },
    data: {
      type: "object",
      additionalProperties: true,
      description: "Setting key to value, merged with defaults (e.g. checkout.maxQtyPerItem: 5)",
    },
  },
};


@ApiTags("Admin: settings")
@Roles(Role.ADMIN)
@Controller("admin/settings")
export class AdminSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly reauth: SettingsReauthService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get all system settings (merged with defaults)" })
  @ApiOkResponse({ schema: settingsEnvelopeSchema })
  get() {
    return this.settings.getAll();
  }

  @Post("reauth")
  @HttpCode(HttpStatus.OK)
  reauthenticate(@Body() dto: ReauthDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.reauth.issue(actor.id, dto.password, dto.key);
  }

  @Get("registry")
  registry() {
    return this.settings.getRegistry();
  }

  @Get("history")
  history(@Query("key") key?: string, @Query("limit") limit?: string) {
    return this.settings.history(key, limit ? Number(limit) : 100);
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Update system settings" })
  @ApiOkResponse({ schema: settingsEnvelopeSchema })
  async update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
    @Headers("x-settings-reauth") reauthToken?: string,
  ) {
    const sensitiveKeys = this.settings
      .getRegistry()
      .filter((setting) => setting.isSensitive && setting.key in dto.values)
      .map((setting) => setting.key);
    if (sensitiveKeys.length > 1) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Submit sensitive settings one at a time");
    }
    for (const key of sensitiveKeys) this.reauth.assert(reauthToken, actor.id, key);
    const values = await this.settings.update(dto.values, actor.id, {
      ...getRequestMeta(request),
    });
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
