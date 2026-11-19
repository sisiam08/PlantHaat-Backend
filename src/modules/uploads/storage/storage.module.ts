import { Global, Logger, Module } from "@nestjs/common";

import { AppConfigService } from "../../../config/app-config.service";
import { CloudinaryStorageDriver } from "./cloudinary-storage.driver";
import { LocalStorageDriver } from "./local-storage.driver";
import { S3StorageDriver } from "./s3-storage.driver";
import { STORAGE_SERVICE, type StorageService } from "./storage.types";

/**
 * Driver selection:
 * - `cloudinary` (or `auto` with the three Cloudinary keys present) → Cloudinary
 * - `s3` → S3-compatible
 * - `local` → local disk (tests / offline dev only; refused in production)
 * Tests always use local so unit/e2e suites never touch the network.
 */
export function resolveStorageDriver(config: AppConfigService): StorageService {
  const values = config.values;
  const hasCloudinary = Boolean(
    values.CLOUDINARY_CLOUD_NAME && values.CLOUDINARY_API_KEY && values.CLOUDINARY_API_SECRET,
  );
  if (values.NODE_ENV === "test") {
    return new LocalStorageDriver(config);
  }
  if (values.STORAGE_DRIVER === "cloudinary" || (values.STORAGE_DRIVER === "auto" && hasCloudinary)) {
    return new CloudinaryStorageDriver(config);
  }
  if (values.STORAGE_DRIVER === "s3") {
    return new S3StorageDriver(config);
  }
  Logger.warn(
    "Local disk storage is active; uploaded images will be served from /uploads. " +
      "Set STORAGE_DRIVER=cloudinary (or s3) for persistent storage.",
    "StorageModule",
  );
  return new LocalStorageDriver(config);
}

@Global()
@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): StorageService => resolveStorageDriver(config),
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
