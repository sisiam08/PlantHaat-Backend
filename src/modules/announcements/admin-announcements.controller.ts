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
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
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
  list(@Query() query: QueryAnnouncementsDto) {
    return this.announcements.list(query);
  }

  @Post()
  @ApiOperation({ summary: "Create an announcement (fans out notifications)" })
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser("id") actorId: string) {
    return this.announcements.create(dto, actorId);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update an announcement" })
  update(@Param("id") id: string, @Body() dto: UpdateAnnouncementDto) {
    return this.announcements.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an announcement" })
  async remove(@Param("id") id: string) {
    await this.announcements.remove(id);
  }
}
