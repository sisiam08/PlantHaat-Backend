import { Module } from "@nestjs/common";

import { UploadsModule } from "../uploads/uploads.module";
import { AdminContentController } from "./admin-content.controller";
import { ContentService } from "./content.service";

@Module({
  imports: [UploadsModule],
  controllers: [AdminContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
