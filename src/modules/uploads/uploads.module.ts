import { Module } from "@nestjs/common";

import { StorageModule } from "./storage/storage.module";
import { UploadsController } from "./uploads.controller";
import { UploadsMaintenanceService } from "./uploads-maintenance.service";
import { UploadsService } from "./uploads.service";

@Module({
  imports: [StorageModule],
  controllers: [UploadsController],
  providers: [UploadsService, UploadsMaintenanceService],
  exports: [UploadsService],
})
export class UploadsModule {}
