import { Module } from "@nestjs/common";

import { UploadsModule } from "../uploads/uploads.module";
import { AdminContentController } from "./admin-content.controller";
import { ContentService } from "./content.service";
import { PublicContentController } from "./public-content.controller";

@Module({
  imports: [UploadsModule],
  controllers: [AdminContentController, PublicContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
