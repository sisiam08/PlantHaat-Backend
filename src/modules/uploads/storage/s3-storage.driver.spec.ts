import { jest } from "@jest/globals";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import type { AppConfigService } from "../../../config/app-config.service";
import { S3StorageDriver, type S3StorageDeps } from "./s3-storage.driver";

function makeConfig(overrides: Record<string, unknown> = {}): AppConfigService {
  return {
    values: {
      STORAGE_DRIVER: "s3",
      S3_BUCKET: "ph-bucket",
      S3_REGION: "ap-southeast-1",
      S3_ENDPOINT: undefined,
      S3_PUBLIC_BASE_URL: "https://cdn.test",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
      ...overrides,
    },
  } as unknown as AppConfigService;
}

function makeDriver() {
  const send = jest.fn<(command: unknown) => Promise<unknown>>().mockResolvedValue({});
  const presign = jest
    .fn<NonNullable<S3StorageDeps["presign"]>>()
    .mockResolvedValue("https://signed.example/obj");
  const driver = new S3StorageDriver(makeConfig(), { client: { send }, presign });
  return { driver, send, presign };
}

describe("S3StorageDriver", () => {
  it("throws when no bucket is configured", () => {
    expect(() => new S3StorageDriver(makeConfig({ S3_BUCKET: undefined }))).toThrow(/S3_BUCKET/);
  });

  it("uploads public objects with immutable cache headers and builds the public URL", async () => {
    const { driver, send } = makeDriver();
    const stored = await driver.put({
      key: "images/product/x.webp",
      buffer: Buffer.from("data"),
      contentType: "image/webp",
      visibility: "public",
    });

    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.CacheControl).toBe("public, max-age=31536000, immutable");
    expect(command.input.ContentType).toBe("image/webp");
    expect(stored.url).toBe("https://cdn.test/images/product/x.webp");
  });

  it("uploads private objects without a public URL", async () => {
    const { driver, send } = makeDriver();
    const stored = await driver.put({
      key: "documents/u1/nid.pdf",
      buffer: Buffer.from("pdf"),
      contentType: "application/pdf",
      visibility: "private",
    });
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command.input.CacheControl).toBe("private, max-age=0, no-store");
    expect(stored.url).toBe("");
  });

  it("deletes objects", async () => {
    const { driver, send } = makeDriver();
    await driver.delete("images/product/x.webp", "public");
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it("returns a short-lived presigned URL for private objects", async () => {
    const { driver, presign } = makeDriver();
    const url = await driver.getPrivateUrl("documents/u1/nid.pdf");
    expect(url).toBe("https://signed.example/obj");
    expect(presign).toHaveBeenCalledWith(expect.anything(), expect.anything(), 300);
  });
});
