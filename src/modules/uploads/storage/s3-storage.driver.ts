import { NotImplementedException } from "@nestjs/common";

import type {
  PutObjectInput,
  StorageService,
  StoredObject,
  StorageVisibility,
} from "./storage.types";

/**
 * S3-compatible storage driver stub (production; Cloudflare R2/S3/Cloudinary
 * can be wired in later). Implements the `StorageService` interface so the
 * application can be configured for S3 without code changes, but performing
 * real operations is not implemented in v1.
 */
export class S3StorageDriver implements StorageService {
  put(_input: PutObjectInput): Promise<StoredObject> {
    throw new NotImplementedException("S3 storage driver is not implemented yet");
  }

  delete(_key: string, _visibility: StorageVisibility): Promise<void> {
    throw new NotImplementedException("S3 storage driver is not implemented yet");
  }

  getPublicUrl(_key: string): string {
    throw new NotImplementedException("S3 storage driver is not implemented yet");
  }

  getPrivateUrl(_key: string): Promise<string> {
    throw new NotImplementedException("S3 storage driver is not implemented yet");
  }
}
