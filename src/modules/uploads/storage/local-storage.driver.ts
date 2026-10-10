import { existsSync, mkdirSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { AppConfigService } from "../../../config/app-config.service";
import type {
  PutObjectInput,
  StorageService,
  StoredObject,
  StorageVisibility,
} from "./storage.types";

export class LocalStorageDriver implements StorageService {
  private readonly rootDir: string;
  private readonly publicDir: string;
  private readonly privateDir: string;
  private readonly baseUrl: string;

  constructor(config: AppConfigService) {
    this.rootDir = resolve(process.cwd(), config.values.UPLOAD_DIR);
    this.publicDir = join(this.rootDir, "public");
    this.privateDir = join(this.rootDir, "private");
    this.baseUrl = config.values.API_URL.replace(/\/$/, "");
    for (const dir of [this.publicDir, this.privateDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  async put(input: PutObjectInput): Promise<StoredObject> {
    const target = this.resolvePath(input.key, input.visibility);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.buffer);
    return {
      key: input.key,
      url: input.visibility === "public" ? this.getPublicUrl(input.key) : "",
    };
  }

  async delete(key: string, visibility: StorageVisibility): Promise<void> {
    await rm(this.resolvePath(key, visibility), { force: true });
  }

  getPublicUrl(key: string): string {
    return `${this.baseUrl}/uploads/${key}`;
  }

  getPrivateUrl(key: string): Promise<string> {
    return Promise.resolve(this.resolvePath(key, "private"));
  }

  resolvePath(key: string, visibility: StorageVisibility): string {
    const base = visibility === "public" ? this.publicDir : this.privateDir;
    return join(base, key);
  }
}
