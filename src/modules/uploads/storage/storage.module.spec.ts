import { Logger } from "@nestjs/common";
import { jest } from "@jest/globals";

import type { AppConfigService } from "../../../config/app-config.service";
import { CloudinaryStorageDriver } from "./cloudinary-storage.driver";
import { LocalStorageDriver } from "./local-storage.driver";
import { resolveStorageDriver } from "./storage.module";

function config(overrides: Record<string, unknown>) {
  return {
    values: {
      NODE_ENV: "development",
      STORAGE_DRIVER: "auto",
      UPLOAD_DIR: "uploads-test",
      API_URL: "http://localhost:5000",
      ...overrides,
    },
  } as unknown as AppConfigService;
}

const KEYS = {
  CLOUDINARY_CLOUD_NAME: "demo",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
};

describe("resolveStorageDriver", () => {
  it("uses Cloudinary when auto mode has all keys", () => {
    expect(resolveStorageDriver(config(KEYS))).toBeInstanceOf(CloudinaryStorageDriver);
  });

  it("uses Cloudinary when explicitly selected", () => {
    expect(resolveStorageDriver(config({ STORAGE_DRIVER: "cloudinary", ...KEYS }))).toBeInstanceOf(
      CloudinaryStorageDriver,
    );
  });

  it("keeps local for tests even when Cloudinary keys are present", () => {
    expect(resolveStorageDriver(config({ NODE_ENV: "test", ...KEYS }))).toBeInstanceOf(
      LocalStorageDriver,
    );
  });

  it("warns when development explicitly selects local storage", () => {
    const warn = jest.spyOn(Logger, "warn").mockImplementation(() => undefined);
    expect(resolveStorageDriver(config({ STORAGE_DRIVER: "local" }))).toBeInstanceOf(
      LocalStorageDriver,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Local disk storage"), "StorageModule");
    warn.mockRestore();
  });
});
