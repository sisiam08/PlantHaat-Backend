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
} from "@nestjs/common";
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiEnvelopeArrayResponse,
  ApiEnvelopeResponse,
} from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { ContentService } from "./content.service";
import { BannerDto, HomepageSectionDto } from "./dto/content-response.dto";
import {
  CreateBannerDto,
  CreateHomepageSectionDto,
  UpdateBannerDto,
  UpdateHomepageSectionDto,
} from "./dto/content.dto";

@ApiTags("Admin: content")
@Roles(Role.ADMIN)
@Controller("admin")
export class AdminContentController {
  constructor(private readonly content: ContentService) {}

  @Get("banners")
  @ApiOperation({ summary: "List banners" })
  @ApiEnvelopeArrayResponse(BannerDto)
  listBanners() {
    return this.content.listBanners();
  }

  @Post("banners")
  @ApiOperation({ summary: "Create a banner" })
  @ApiEnvelopeResponse(BannerDto, { status: 201 })
  createBanner(@Body() dto: CreateBannerDto) {
    return this.content.createBanner(dto);
  }

  @Patch("banners/:id")
  @ApiOperation({ summary: "Update a banner" })
  @ApiEnvelopeResponse(BannerDto)
  updateBanner(@Param("id") id: string, @Body() dto: UpdateBannerDto) {
    return this.content.updateBanner(id, dto);
  }

  @Delete("banners/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a banner" })
  @ApiNoContentResponse({ description: "Banner deleted" })
  async deleteBanner(@Param("id") id: string) {
    await this.content.deleteBanner(id);
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
