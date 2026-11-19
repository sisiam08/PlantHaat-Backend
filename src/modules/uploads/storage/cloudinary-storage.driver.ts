import { Logger } from "@nestjs/common";
import { v2 as cloudinary } from "cloudinary";

import { AppConfigService } from "../../../config/app-config.service";
import { currentFolderPrefix } from "../upload-references";
import type {
  PutObjectInput,
  StorageResourceType,
  StorageService,
  StorageVisibility,
  StoredObject,
} from "./storage.types";

const UPLOAD_TIMEOUT_MS = 120_000;
const PRIVATE_URL_TTL_SECONDS = 300;

interface UploadResult {
  public_id: string;
  secure_url: string;
  resource_type?: string;
}

/** Minimal surface of the Cloudinary v2 SDK used here (mockable in tests). */
export interface CloudinaryLike {
  uploader: {
    upload_stream(
      options: Record<string, unknown>,
      callback: (error: unknown, result?: UploadResult) => void,
    ): { end(buffer: Buffer): void };
    destroy(
      publicId: string,
      options: Record<string, unknown>,
    ): Promise<unknown>;
  };
  utils: {
    private_download_url(
      publicId: string,
      format: string,
      options: Record<string, unknown>,
    ): string;
  };
}

export interface CloudinaryDriverDeps {
  client?: CloudinaryLike;
  now?: () => number;
}

const DOCUMENT_EXTENSIONS = [".pdf", ".doc", ".docx", ".txt"];

function splitExtension(key: string): { base: string; extension: string } {
  const slash = key.lastIndexOf("/");
  const dot = key.lastIndexOf(".");
  if (dot <= slash) {
    return { base: key, extension: "" };
  }
  return { base: key.slice(0, dot), extension: key.slice(dot + 1).toLowerCase() };
}

export class CloudinaryStorageDriver implements StorageService {
  private readonly logger = new Logger(CloudinaryStorageDriver.name);
  private readonly client: CloudinaryLike;
  private readonly cloudName: string;
  private readonly folderPrefix: string;
  private readonly now: () => number;

  constructor(config: AppConfigService, deps: CloudinaryDriverDeps = {}) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
      config.values;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new Error(
        "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are required for the cloudinary storage driver",
      );
    }
    this.cloudName = CLOUDINARY_CLOUD_NAME;
    this.folderPrefix = currentFolderPrefix(config.values);
    this.now = deps.now ?? (() => Date.now());

    if (deps.client) {
      this.client = deps.client;
    } else {
      cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
        secure: true,
      });
      this.client = cloudinary;
    }
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const resourceType: StorageResourceType =
      input.resourceType ?? (input.contentType.startsWith("image/") ? "image" : "raw");
    const { base } = splitExtension(input.key);
    // Cloudinary public_ids for image assets have no extension; raw assets keep it.
    const publicId = resourceType === "image" ? base : input.key;
    const isPrivate = input.visibility === "private";
    const folder =
      input.folder ??
      (isPrivate ? `${this.folderPrefix}/private/seller-docs` : this.folderPrefix);

    const options: Record<string, unknown> = {
      resource_type: resourceType,
      public_id: publicId,
      folder,
      type: isPrivate ? "authenticated" : "upload",
      access_mode: isPrivate ? undefined : "public",
      timeout: UPLOAD_TIMEOUT_MS,
      overwrite: false,
      use_filename: false,
      unique_filename: false,
    };
    if (input.format) {
      options.format = input.format;
    }

    const result = await this.upload(input.buffer, options);
    return {
      key: result.public_id,
      url: isPrivate ? "" : result.secure_url,
      resourceType,
    };
  }

  private upload(buffer: Buffer, options: Record<string, unknown>): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const stream = this.client.uploader.upload_stream(options, (error, result) => {
        if (error || !result) {
          reject(error instanceof Error ? error : new Error("Cloudinary upload returned no result"));
          return;
        }
        resolve(result);
      });
      stream.end(buffer);
    });
  }

  async delete(key: string, visibility: StorageVisibility): Promise<void> {
    const { base } = splitExtension(key);
    const resourceType = this.resourceTypeForKey(key);
    const publicId = resourceType === "image" ? base : key;
    await this.client.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: visibility === "private" ? "authenticated" : "upload",
      invalidate: true,
    });
  }

  getPublicUrl(key: string): string {
    const resourceType = this.resourceTypeForKey(key);
    return `https://res.cloudinary.com/${this.cloudName}/${resourceType}/upload/${key}`;
  }

  getPrivateUrl(key: string): Promise<string> {
    const resourceType = this.resourceTypeForKey(key);
    const { base, extension } = splitExtension(key);
    const publicId = resourceType === "image" ? base : key;
    const format = resourceType === "image" ? extension || "jpg" : "";
    return Promise.resolve(this.client.utils.private_download_url(publicId, format, {
      type: "authenticated",
      resource_type: resourceType,
      expires_at: Math.floor(this.now() / 1000) + PRIVATE_URL_TTL_SECONDS,
      attachment: false,
    }));
  }

  async deleteByUrl(url: string): Promise<void> {
    const parsed = parseCloudinaryUrl(url);
    if (!parsed) {
      this.logger.debug(`Skipping Cloudinary delete for non-Cloudinary URL: ${url}`);
      return;
    }
    await this.client.uploader.destroy(parsed.publicId, {
      resource_type: parsed.resourceType,
      type: "upload",
      invalidate: true,
    });
  }

  private resourceTypeForKey(key: string): StorageResourceType {
    const { extension } = splitExtension(key);
    return DOCUMENT_EXTENSIONS.includes(`.${extension}`) ? "raw" : "image";
  }
}

/** Parses a Cloudinary delivery URL into its public_id + resource type. */
export function parseCloudinaryUrl(
  url: string,
): { publicId: string; resourceType: StorageResourceType } | null {
  const match = url.match(/\/(image|raw|video)\/upload\/(?:v\d+\/)?(.+)$/);
  if (!match) {
    return null;
  }
  const resourceType = match[1] === "raw" ? "raw" : "image";
  const rawPath = match[2];
  // Images omit the extension in public_id; raw assets keep it.
  const publicId =
    resourceType === "raw" ? rawPath : rawPath.replace(/\.[a-zA-Z0-9]+$/, "");
  return { publicId, resourceType };
}
