import { Global, Module } from "@nestjs/common";

import { UploadsModule } from "../uploads/uploads.module";
import { AdminSettingsController } from "./admin-settings.controller";
import { PublicSettingsController } from "./public-settings.controller";
import { SettingsReauthService } from "./settings-reauth.service";
import { SettingsService } from "./settings.service";

@Global()
@Module({
  imports: [UploadsModule],
  controllers: [AdminSettingsController, PublicSettingsController],
  providers: [SettingsService, SettingsReauthService],
  exports: [SettingsService, SettingsReauthService],
})
export class SettingsModule {}
