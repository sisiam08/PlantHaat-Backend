import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  detectImageMime,
  MAX_IMAGE_BYTES,
  reencodeImage,
} from "./image.util";
import { STORAGE_SERVICE, type StorageService, type StoredObject } from "./storage/storage.types";
import type { UploadPurpose } from "./dto/upload-image.dto";

@Injectable()
export class UploadsService {
  constructor(@Inject(STORAGE_SERVICE) private readonly storage: StorageService) {}

  async uploadImage(
    file: Express.Multer.File | undefined,
    purpose: UploadPurpose,
    ownerId: string,
  ): Promise<StoredObject> {
    if (!file) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "A file is required");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw AppException.badRequest(ErrorCode.UPLOAD_TOO_LARGE, "Image must be 5 MB or smaller");
    }

    const detected = detectImageMime(file.buffer);
    const claimed = file.mimetype as (typeof ALLOWED_IMAGE_MIME_TYPES)[number];
    if (!detected || !ALLOWED_IMAGE_MIME_TYPES.includes(claimed) || detected !== claimed) {
      throw AppException.badRequest(
        ErrorCode.UPLOAD_INVALID_TYPE,
        "Only JPEG, PNG and WebP images are allowed",
      );
    }

    let processed: Buffer;
    try {
      processed = await reencodeImage(file.buffer);
    } catch {
      throw AppException.badRequest(ErrorCode.UPLOAD_INVALID_TYPE, "The image could not be processed");
    }

    const key = `images/${purpose}/${ownerId}/${randomUUID()}.webp`;
    return this.storage.put({
      key,
      buffer: processed,
      contentType: "image/webp",
      visibility: "public",
    });
  }
}
