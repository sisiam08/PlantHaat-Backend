import { Module } from "@nestjs/common";

import { AdminContentController } from "./admin-content.controller";
import { ContentService } from "./content.service";

@Module({
  controllers: [AdminContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
