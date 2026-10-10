export type StorageVisibility = "public" | "private";

export interface PutObjectInput {
  key: string;
  buffer: Buffer;
  contentType: string;
  visibility: StorageVisibility;
}

export interface StoredObject {
  key: string;
  url: string;
}

export interface StorageService {
  put(input: PutObjectInput): Promise<StoredObject>;
  delete(key: string, visibility: StorageVisibility): Promise<void>;
  getPublicUrl(key: string): string;
  /**
   * Returns a URL or local path that can be used to fetch a private object.
   * The local driver returns an absolute filesystem path (streamed by the
   * admin route); an S3-compatible driver would return a signed URL.
   */
  getPrivateUrl(key: string): Promise<string>;
}

export const STORAGE_SERVICE = Symbol("STORAGE_SERVICE");
