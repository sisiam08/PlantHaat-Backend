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
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import { ContentService } from "./content.service";
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
  listBanners() {
    return this.content.listBanners();
  }

  @Post("banners")
  @ApiOperation({ summary: "Create a banner" })
  createBanner(@Body() dto: CreateBannerDto) {
    return this.content.createBanner(dto);
  }

  @Patch("banners/:id")
  @ApiOperation({ summary: "Update a banner" })
  updateBanner(@Param("id") id: string, @Body() dto: UpdateBannerDto) {
    return this.content.updateBanner(id, dto);
  }

  @Delete("banners/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a banner" })
  async deleteBanner(@Param("id") id: string) {
    await this.content.deleteBanner(id);
  }

  @Get("homepage-sections")
  @ApiOperation({ summary: "List homepage sections" })
  listSections() {
    return this.content.listSections();
  }

  @Post("homepage-sections")
  @ApiOperation({ summary: "Create a homepage section" })
  createSection(@Body() dto: CreateHomepageSectionDto) {
    return this.content.createSection(dto);
  }

  @Patch("homepage-sections/:id")
  @ApiOperation({ summary: "Update a homepage section" })
  updateSection(@Param("id") id: string, @Body() dto: UpdateHomepageSectionDto) {
    return this.content.updateSection(id, dto);
  }

  @Delete("homepage-sections/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a homepage section" })
  async deleteSection(@Param("id") id: string) {
    await this.content.deleteSection(id);
  }
}
