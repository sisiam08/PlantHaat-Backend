import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import {
  documentContentType,
  documentExtension,
  detectDocumentKind,
  MAX_DOCUMENT_BYTES,
} from "./document.util";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  DEFAULT_IMAGE_MAX_EDGE,
  detectImageMime,
  MAX_IMAGE_BYTES,
  PRODUCT_IMAGE_MAX_EDGE,
  PRODUCT_IMAGE_QUALITY,
  reencodeImage,
} from "./image.util";
import { STORAGE_SERVICE, type StorageService, type StoredObject } from "./storage/storage.types";
import { UploadPurpose } from "./dto/upload-image.dto";

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(@Inject(STORAGE_SERVICE) private readonly storage: StorageService) {
    this.logger.log(
      `Image long edge: product=${PRODUCT_IMAGE_MAX_EDGE}px, other purposes=${DEFAULT_IMAGE_MAX_EDGE}px`,
    );
  }

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
      processed = await reencodeImage(
        file.buffer,
        purpose === UploadPurpose.PRODUCT
          ? { maxEdge: PRODUCT_IMAGE_MAX_EDGE, quality: PRODUCT_IMAGE_QUALITY }
          : undefined,
      );
    } catch {
      throw AppException.badRequest(
        ErrorCode.UPLOAD_INVALID_TYPE,
        "The image could not be processed",
      );
    }

    const key = `images/${purpose}/${ownerId}/${randomUUID()}.webp`;
    return this.storage.put({
      key,
      buffer: processed,
      contentType: "image/webp",
      visibility: "public",
    });
  }

  async uploadDocument(
    file: Express.Multer.File | undefined,
    ownerId: string,
  ): Promise<{ key: string }> {
    if (!file) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "A file is required");
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw AppException.badRequest(
        ErrorCode.UPLOAD_TOO_LARGE,
        "Document must be 10 MB or smaller",
      );
    }
    const kind = detectDocumentKind(file.buffer);
    if (!kind) {
      throw AppException.badRequest(
        ErrorCode.UPLOAD_INVALID_TYPE,
        "Only PDF, JPEG, PNG and WebP documents are allowed",
      );
    }

    const key = `documents/${ownerId}/${randomUUID()}.${documentExtension(kind)}`;
    await this.storage.put({
      key,
      buffer: file.buffer,
      contentType: documentContentType(kind),
      visibility: "private",
    });
    return { key };
  }
}
