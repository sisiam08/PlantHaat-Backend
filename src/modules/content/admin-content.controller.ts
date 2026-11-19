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
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiEnvelopeArrayResponse,
  ApiEnvelopeResponse,
} from "../../common/swagger/api-response.decorators";
import { getRequestMeta } from "../../common/utils/request-meta";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { Role } from "../../generated/prisma/enums";
import { ContentService, type ContentActor } from "./content.service";
import { BannerDto, HomepageSectionDto } from "./dto/content-response.dto";
import {
  CreateBannerDto,
  CreateHomepageSectionDto,
  ReorderBannersDto,
  UpdateBannerDto,
  UpdateHomepageSectionDto,
} from "./dto/content.dto";

function actorOf(user: AuthenticatedUser, request: Request): ContentActor {
  return {
    id: user.id,
    role: user.role,
    ...getRequestMeta(request),
  };
}

@ApiTags("Admin: content")
@Roles(Role.ADMIN)
@Controller("admin")
export class AdminContentController {
  constructor(private readonly content: ContentService) {}

  @Get("banners")
  @ApiOperation({ summary: "List banners (optionally by placement)" })
  @ApiEnvelopeArrayResponse(BannerDto)
  listBanners(@Query("placement") placement?: string) {
    return this.content.listBanners(placement);
  }

  @Post("banners")
  @ApiOperation({ summary: "Create a banner" })
  @ApiEnvelopeResponse(BannerDto, { status: 201 })
  createBanner(
    @Body() dto: CreateBannerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.content.createBanner(dto, actorOf(user, request));
  }

  @Patch("banners/reorder")
  @ApiOperation({ summary: "Reorder banners in one transaction" })
  @ApiEnvelopeArrayResponse(BannerDto)
  reorderBanners(
    @Body() dto: ReorderBannersDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.content.reorderBanners(dto.ids, actorOf(user, request));
  }

  @Post("banners/:id/duplicate")
  @ApiOperation({ summary: "Duplicate a banner as a hidden draft" })
  @ApiEnvelopeResponse(BannerDto, { status: 201 })
  duplicateBanner(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.content.duplicateBanner(id, actorOf(user, request));
  }

  @Patch("banners/:id")
  @ApiOperation({ summary: "Update a banner" })
  @ApiEnvelopeResponse(BannerDto)
  updateBanner(
    @Param("id") id: string,
    @Body() dto: UpdateBannerDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    return this.content.updateBanner(id, dto, actorOf(user, request));
  }

  @Delete("banners/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a banner" })
  @ApiNoContentResponse({ description: "Banner deleted" })
  async deleteBanner(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
  ) {
    await this.content.deleteBanner(id, actorOf(user, request));
  }

  @Get("homepage-sections")
  @ApiOperation({ summary: "List homepage sections" })
  @ApiEnvelopeArrayResponse(HomepageSectionDto)
  listSections() {
    return this.content.listSections();
  }

  @Post("homepage-sections")
  @ApiOperation({ summary: "Create a homepage section" })
  @ApiEnvelopeResponse(HomepageSectionDto, { status: 201 })
  createSection(@Body() dto: CreateHomepageSectionDto) {
    return this.content.createSection(dto);
  }

  @Patch("homepage-sections/:id")
  @ApiOperation({ summary: "Update a homepage section" })
  @ApiEnvelopeResponse(HomepageSectionDto)
  updateSection(@Param("id") id: string, @Body() dto: UpdateHomepageSectionDto) {
    return this.content.updateSection(id, dto);
  }

  @Delete("homepage-sections/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a homepage section" })
  @ApiNoContentResponse({ description: "Section deleted" })
  async deleteSection(@Param("id") id: string) {
    await this.content.deleteSection(id);
  }
}
