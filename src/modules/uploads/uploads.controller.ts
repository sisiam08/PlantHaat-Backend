import { Body, Controller, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { ApiEnvelopeResponse } from "../../common/swagger/api-response.decorators";
import { Role } from "../../generated/prisma/enums";
import { MAX_DOCUMENT_BYTES } from "./document.util";
import { UploadImageDto } from "./dto/upload-image.dto";
import { UploadResultDto } from "./dto/upload-result.dto";
import { MAX_IMAGE_BYTES } from "./image.util";
import { UploadsService } from "./uploads.service";

@ApiTags("Uploads")
@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("images")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_IMAGE_BYTES } }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
        purpose: { type: "string" },
      },
      required: ["file", "purpose"],
    },
  })
  @ApiOperation({ summary: "Upload an image (re-encoded, EXIF stripped)" })
  @ApiEnvelopeResponse(UploadResultDto, { status: 201 })
  uploadImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadImageDto,
    @CurrentUser("id") userId: string,
  ) {
    return this.uploadsService.uploadImage(file, dto.purpose, userId);
  }

  @Post("documents")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Roles(Role.SELLER)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_DOCUMENT_BYTES } }))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @ApiOperation({ summary: "Upload a private document (seller onboarding)" })
  @ApiEnvelopeResponse(UploadResultDto, { status: 201 })
  uploadDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser("id") userId: string,
  ) {
    return this.uploadsService.uploadDocument(file, userId);
  }
}
