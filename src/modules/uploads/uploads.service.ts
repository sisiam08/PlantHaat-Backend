import { randomUUID } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import sharp from "sharp";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  documentContentType,
  documentExtension,
  detectDocumentKind,
  MAX_DOCUMENT_BYTES,
} from "./document.util";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  BANNER_IMAGE_MAX_EDGE,
  DEFAULT_IMAGE_MAX_EDGE,
  detectImageMime,
  HEIC_MIME_TYPES,
  MAX_IMAGE_BYTES,
  PRODUCT_IMAGE_MAX_EDGE,
  PRODUCT_IMAGE_QUALITY,
  reencodeImage,
} from "./image.util";
import { STORAGE_SERVICE, type StorageService, type StoredObject } from "./storage/storage.types";
import { UploadPurpose } from "./dto/upload-image.dto";

/** Cloudinary/local folder per upload purpose. */
const PURPOSE_FOLDER: Record<UploadPurpose, string> = {
  [UploadPurpose.AVATAR]: "avatars",
  [UploadPurpose.PRODUCT]: "products",
  [UploadPurpose.SHOP_LOGO]: "shops",
  [UploadPurpose.SHOP_BANNER]: "shops",
  [UploadPurpose.REVIEW]: "reviews",
  [UploadPurpose.COMPLAINT]: "complaints",
  [UploadPurpose.DELIVERY_PROOF]: "delivery-proofs",
  [UploadPurpose.PAYMENT]: "payments",
  [UploadPurpose.BANNER]: "banners",
  [UploadPurpose.CATEGORY]: "categories",
};

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {
    this.logger.log(
      `Image long edge: product=${PRODUCT_IMAGE_MAX_EDGE}px, banner=${BANNER_IMAGE_MAX_EDGE}px, other purposes=${DEFAULT_IMAGE_MAX_EDGE}px`,
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
        "Only JPEG, PNG, WebP, HEIC and HEIF images are allowed",
      );
    }

    const isHeic = (HEIC_MIME_TYPES as readonly string[]).includes(detected);
    const folder = PURPOSE_FOLDER[purpose];
    let buffer: Buffer;
    let extension: string;
    let contentType: string;
    try {
      if (isHeic) {
        // sharp cannot decode HEVC; Cloudinary converts HEIC/HEIF to jpg.
        buffer = file.buffer;
        extension = detected === "image/heif" ? "heif" : "heic";
        contentType = detected;
      } else {
        buffer = await reencodeImage(
          file.buffer,
          purpose === UploadPurpose.PRODUCT
            ? { maxEdge: PRODUCT_IMAGE_MAX_EDGE, quality: PRODUCT_IMAGE_QUALITY }
            : purpose === UploadPurpose.BANNER
              ? { maxEdge: BANNER_IMAGE_MAX_EDGE }
              : undefined,
        );
        extension = "webp";
        contentType = "image/webp";
      }
    } catch {
      throw AppException.badRequest(
        ErrorCode.UPLOAD_INVALID_TYPE,
        "The image could not be processed",
      );
    }

    const key = `${folder}/${ownerId}/${randomUUID()}.${extension}`;
    const stored = await this.storage.put({
      key,
      buffer,
      contentType,
      visibility: "public",
      resourceType: "image",
      ...(isHeic ? { format: "jpg" } : {}),
    });
    let width: number | undefined;
    let height: number | undefined;
    try {
      const metadata = await sharp(buffer).metadata();
      width = metadata.width;
      height = metadata.height;
    } catch {
      // HEIC/HEIF and unexpected encodings may not be decodable here.
    }
    const result: StoredObject = { ...stored, width, height };
    await this.trackAsset(result, purpose, ownerId);
    return result;
  }

  async uploadDocument(
    file: Express.Multer.File | undefined,
    _ownerId: string,
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

    const key = `${randomUUID()}.${documentExtension(kind)}`;
    const stored = await this.storage.put({
      key,
      buffer: file.buffer,
      contentType: documentContentType(kind),
      visibility: "private",
      resourceType: kind === "pdf" ? "raw" : "image",
    });
    return { key: stored.key };
  }

  /**
   * Marks PENDING assets ATTACHED inside the caller's transaction so the
   * entity write and the lifecycle change commit or roll back together.
   */
  async attachAssetsInTransaction(
    tx: Prisma.TransactionClient,
    urls: Iterable<string | null | undefined>,
  ): Promise<void> {
    const values = [...new Set([...urls].filter((url): url is string => Boolean(url)))];
    if (values.length === 0) return;
    await tx.uploadedAsset.updateMany({
      where: { url: { in: values }, status: "PENDING" },
      data: { status: "ATTACHED", attachedAt: new Date() },
    });
  }

  /** Marks the PENDING assets whose URLs were attached to an entity. */
  async attachAssets(urls: Iterable<string | null | undefined>): Promise<void> {
    const values = [...new Set([...urls].filter((url): url is string => Boolean(url)))];
    if (values.length === 0) return;
    try {
      await this.prisma.$transaction((tx) => this.attachAssetsInTransaction(tx, values));
    } catch (error) {
      // Tracking must never fail a caller that is not already in a transaction.
      this.logger.debug(
        `Could not mark uploads attached: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  /** Marks the PENDING asset whose URL was attached to an entity. */
  async attachAsset(url: string | null | undefined): Promise<void> {
    await this.attachAssets([url]);
  }

  /** Best-effort deletion of replaced/removed assets (never throws). */
  async deleteAssets(urls: Iterable<string | null | undefined>): Promise<void> {
    const values = [...new Set([...urls].filter((url): url is string => Boolean(url)))];
    for (const url of values) {
      await this.deleteByUrl(url);
    }
  }

  /** Tiny upload + HEAD + delete used by the admin storage health check. */
  async storageHealthCheck(): Promise<{ ok: boolean; latencyMs: number }> {
    const started = Date.now();
    const key = `smoke/${randomUUID()}.png`;
    const stored = await this.storage.put({
      key,
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWMQCdCAIwbiOADidAjBP8yuuwAAAABJRU5ErkJggg==",
        "base64",
      ),
      contentType: "image/png",
      visibility: "public",
      resourceType: "image",
    });
    try {
      if (!stored.url) throw new Error("Storage returned no public URL");
      const response = await fetch(stored.url, { method: "HEAD" });
      if (!response.ok) throw new Error(`Storage delivery returned ${response.status}`);
      return { ok: true, latencyMs: Date.now() - started };
    } finally {
      await this.storage.delete(stored.key, "public").catch((error: unknown) => {
        this.logger.warn(
          `Storage health cleanup failed: ${error instanceof Error ? error.message : "unknown"}`,
        );
      });
    }
  }

  /** Best-effort deletion of a replaced/removed asset (never throws). */
  async deleteByUrl(url: string | null | undefined): Promise<void> {
    if (!url) return;
    try {
      await this.storage.deleteByUrl?.(url);
      await this.prisma.uploadedAsset.deleteMany({ where: { url } });
    } catch (error) {
      this.logger.debug(
        `Asset cleanup failed for ${url}: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  private async trackAsset(
    stored: StoredObject,
    purpose: UploadPurpose,
    ownerId: string,
  ): Promise<void> {
    try {
      await this.prisma.uploadedAsset.create({
        data: {
          publicId: stored.key,
          resourceType: stored.resourceType ?? "image",
          url: stored.url || null,
          purpose,
          ownerId,
          status: "PENDING",
          width: stored.width ?? null,
          height: stored.height ?? null,
        },
      });
    } catch (error) {
      // Asset tracking must never fail an upload.
      this.logger.debug(
        `Could not track upload ${stored.key}: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
}
