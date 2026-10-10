import { Body, Controller, Get, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ApiEnvelopeResponse } from "../../common/swagger/api-response.decorators";
import { MAX_IMAGE_BYTES } from "../uploads/image.util";
import { PublicUserDto } from "./dto/public-user.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UsersService } from "./users.service";

@ApiTags("Users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @ApiOperation({ summary: "Get the current user's profile" })
  @ApiEnvelopeResponse(PublicUserDto)
  getMe(@CurrentUser("id") userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch("me")
  @ApiOperation({ summary: "Update the current user's profile (name, phone, notificationPrefs)" })
  @ApiEnvelopeResponse(PublicUserDto)
  updateMe(@CurrentUser("id") userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Post("me/avatar")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMAGE_BYTES } }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @ApiOperation({ summary: "Upload/replace the current user's avatar" })
  uploadAvatar(
    @CurrentUser("id") userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.usersService.updateAvatar(userId, file);
  }
}
