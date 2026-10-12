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
} from "@nestjs/common";
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { AnnouncementDto } from "./dto/announcement-response.dto";
import { AnnouncementsService } from "./announcements.service";
import {
  CreateAnnouncementDto,
  QueryAnnouncementsDto,
  UpdateAnnouncementDto,
} from "./dto/announcement.dto";

@ApiTags("Admin: announcements")
@Roles(Role.ADMIN)
@Controller("admin/announcements")
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: "List announcements" })
  @ApiPaginatedResponse(AnnouncementDto)
  list(@Query() query: QueryAnnouncementsDto) {
    return this.announcements.list(query);
  }

  @Post()
  @ApiOperation({ summary: "Create an announcement (fans out notifications)" })
  @ApiEnvelopeResponse(AnnouncementDto, { status: 201 })
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser("id") actorId: string) {
    return this.announcements.create(dto, actorId);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update an announcement" })
  @ApiEnvelopeResponse(AnnouncementDto)
  update(@Param("id") id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.announcements.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an announcement" })
  @ApiNoContentResponse({ description: "Announcement deleted" })
  async remove(@Param("id") id: string) {
    await this.announcements.remove(id);
  }
}
