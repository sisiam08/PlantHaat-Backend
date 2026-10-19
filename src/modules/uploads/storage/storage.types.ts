export type StorageVisibility = "public" | "private";
export type StorageResourceType = "image" | "raw";

export interface PutObjectInput {
  /** Object key / Cloudinary public_id (relative, no leading slash). */
  key: string;
  buffer: Buffer;
  contentType: string;
  visibility: StorageVisibility;
  /** Cloudinary resource type; inferred when omitted. */
  resourceType?: StorageResourceType;
  /** Output format requested from the storage provider (e.g. "jpg"). */
  format?: string;
  /** Overrides the provider folder (Cloudinary); defaults to the key's first segment. */
  folder?: string;
}

export interface StoredObject {
  key: string;
  url: string;
  resourceType?: StorageResourceType;
}

export interface StorageService {
  put(input: PutObjectInput): Promise<StoredObject>;
  delete(key: string, visibility: StorageVisibility): Promise<void>;
  getPublicUrl(key: string): string;
  /**
   * Returns a URL or local path that can be used to fetch a private object.
   * The local driver returns an absolute filesystem path (streamed by the
   * admin route); Cloudinary/S3 return a short-lived signed URL.
   */
  getPrivateUrl(key: string): Promise<string>;
  /** Best-effort deletion by a previously stored delivery URL (optional). */
  deleteByUrl?(url: string): Promise<void>;
}

export const STORAGE_SERVICE = Symbol("STORAGE_SERVICE");
