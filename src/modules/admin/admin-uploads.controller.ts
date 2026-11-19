import { Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { Roles } from "../../common/decorators/roles.decorator";
import { Role } from "../../generated/prisma/enums";
import { UploadsService } from "../uploads/uploads.service";

@ApiTags("Admin uploads")
@Controller("admin/uploads")
@Roles(Role.ADMIN)
export class AdminUploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post("storage-check")
  @ApiOperation({ summary: "Upload, fetch and delete a tiny probe image" })
  storageCheck() {
    return this.uploads.storageHealthCheck();
  }
}
