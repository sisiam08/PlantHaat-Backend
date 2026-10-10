import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { AppConfigService } from "../../../config/app-config.service";
import type {
  PutObjectInput,
  StorageService,
  StoredObject,
  StorageVisibility,
} from "./storage.types";

const PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable";
const PRIVATE_CACHE_CONTROL = "private, max-age=0, no-store";
const PRESIGNED_URL_TTL_SECONDS = 300;

export interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

export interface S3StorageDeps {
  client?: S3ClientLike;
  presign?: (client: S3Client, command: GetObjectCommand, ttl: number) => Promise<string>;
}

/**
 * S3-compatible storage (AWS S3, Cloudflare R2, MinIO). Public objects are
 * served via `S3_PUBLIC_BASE_URL` with long-lived immutable caching; private
 * objects are only reachable through short-lived presigned GET URLs.
 */
export class S3StorageDriver implements StorageService {
  private readonly client: S3Client;
  private readonly presign: NonNullable<S3StorageDeps["presign"]>;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: AppConfigService, deps: S3StorageDeps = {}) {
    const {
      S3_BUCKET,
      S3_PUBLIC_BASE_URL,
      S3_ENDPOINT,
      S3_REGION,
      S3_ACCESS_KEY_ID,
      S3_SECRET_ACCESS_KEY,
    } = config.values;

    if (!S3_BUCKET) {
      throw new Error("S3_BUCKET is required for the S3 storage driver");
    }
    this.bucket = S3_BUCKET;

    this.client = deps.client
      ? (deps.client as S3Client)
      : new S3Client({
          region: S3_REGION ?? "auto",
          endpoint: S3_ENDPOINT,
          forcePathStyle: Boolean(S3_ENDPOINT),
          credentials: S3_ACCESS_KEY_ID
            ? { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY ?? "" }
            : undefined,
        });

    this.presign =
      deps.presign ??
      ((client, command, ttl) => getSignedUrl(client, command, { expiresIn: ttl }));

    const fallbackBase =
      S3_ENDPOINT && S3_BUCKET ? `${S3_ENDPOINT.replace(/\/$/, "")}/${S3_BUCKET}` : undefined;
    this.publicBaseUrl = (S3_PUBLIC_BASE_URL ?? fallbackBase ?? "").replace(/\/$/, "");
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.buffer,
        ContentType: input.contentType,
        CacheControl:
          input.visibility === "public" ? PUBLIC_CACHE_CONTROL : PRIVATE_CACHE_CONTROL,
      }),
    );
    return {
      key: input.key,
      url: input.visibility === "public" ? this.getPublicUrl(input.key) : "",
    };
  }

  async delete(key: string, _visibility: StorageVisibility): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  getPublicUrl(key: string): string {
    if (!this.publicBaseUrl) {
      throw new Error("S3_PUBLIC_BASE_URL is required to serve public objects");
    }
    return `${this.publicBaseUrl}/${key}`;
  }

  async getPrivateUrl(key: string): Promise<string> {
    return this.presign(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      PRESIGNED_URL_TTL_SECONDS,
    );
  }
}
