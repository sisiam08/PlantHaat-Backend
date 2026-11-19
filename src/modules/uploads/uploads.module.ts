import { Module } from "@nestjs/common";

import { StorageModule } from "./storage/storage.module";
import { UploadReferencesService } from "./upload-references.service";
import { UploadsController } from "./uploads.controller";
import { UploadsMaintenanceService } from "./uploads-maintenance.service";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [StorageModule],
  controllers: [UploadsController],
  providers: [UploadsService, UploadReferencesService, UploadsMaintenanceService],
  exports: [UploadsService, UploadReferencesService, UploadsMaintenanceService],
})
export class UploadsModule {}
