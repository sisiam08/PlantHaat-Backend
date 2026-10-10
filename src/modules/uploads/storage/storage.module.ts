import { Global, Module } from "@nestjs/common";

import { AppConfigService } from "../../../config/app-config.service";
import { LocalStorageDriver } from "./local-storage.driver";
import { S3StorageDriver } from "./s3-storage.driver";
import { STORAGE_SERVICE, type StorageService } from "./storage.types";

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): StorageService =>
        config.values.STORAGE_DRIVER === "s3"
          ? new S3StorageDriver(config)
          : new LocalStorageDriver(config),
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
