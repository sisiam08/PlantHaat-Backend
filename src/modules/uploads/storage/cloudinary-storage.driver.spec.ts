import { jest } from "@jest/globals";

import type { AppConfigService } from "../../../config/app-config.service";
import {
  CloudinaryStorageDriver,
  parseCloudinaryUrl,
  type CloudinaryLike,
} from "./cloudinary-storage.driver";

function config(overrides: Record<string, unknown> = {}) {
  return {
    values: {
      NODE_ENV: "development",
      CLOUDINARY_CLOUD_NAME: "demo-cloud",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
      CLOUDINARY_FOLDER_PREFIX: "planthaat/development",
      ...overrides,
    },
  } as unknown as AppConfigService;
}

function mockClient() {
  const result = {
    public_id: "planthaat/development/products/u1/abc",
    secure_url: "https://res.cloudinary.com/demo-cloud/image/upload/v1/planthaat/development/products/u1/abc.webp",
    resource_type: "image",
  };
  const uploadStream = jest.fn((_options: Record<string, unknown>, cb: (e: unknown, r?: typeof result) => void) => {
    cb(null, result);
    return { end: jest.fn() };
  });
  const destroy = jest.fn(async () => ({ result: "ok" }));
  const privateUrl = jest.fn(() => "https://res.cloudinary.com/demo-cloud/image/download?signature=x");
  const client: CloudinaryLike = {
    uploader: { upload_stream: uploadStream as never, destroy: destroy as never },
    utils: { private_download_url: privateUrl as never },
  };
  return { client, uploadStream, destroy, privateUrl, result };
}

describe("CloudinaryStorageDriver", () => {
  it("uploads a public image without an extension in the public_id", async () => {
    const { client, uploadStream } = mockClient();
    const driver = new CloudinaryStorageDriver(config(), { client });
    const stored = await driver.put({
      key: "products/u1/abc.webp",
      buffer: Buffer.from("x"),
      contentType: "image/webp",
      visibility: "public",
      resourceType: "image",
    });
    const options = uploadStream.mock.calls[0][0];
    expect(options).toMatchObject({
      folder: "planthaat/development",
      public_id: "products/u1/abc",
      resource_type: "image",
      type: "upload",
      access_mode: "public",
      timeout: 120000,
    });
    expect(stored.key).toBe("planthaat/development/products/u1/abc");
    expect(stored.url).toContain("res.cloudinary.com");
  });

  it("uploads private seller documents as authenticated raw assets", async () => {
    const { client, uploadStream } = mockClient();
    const driver = new CloudinaryStorageDriver(config(), { client });
    await driver.put({
      key: "doc-1.pdf",
      buffer: Buffer.from("%PDF-1.4"),
      contentType: "application/pdf",
      visibility: "private",
      resourceType: "raw",
    });
    expect(uploadStream.mock.calls[0][0]).toMatchObject({
      folder: "planthaat/development/private/seller-docs",
      public_id: "doc-1.pdf",
      resource_type: "raw",
      type: "authenticated",
    });
  });

  it("passes format jpg for HEIC conversions", async () => {
    const { client, uploadStream } = mockClient();
    const driver = new CloudinaryStorageDriver(config(), { client });
    await driver.put({
      key: "products/u1/pic.heic",
      buffer: Buffer.from("heic"),
      contentType: "image/heic",
      visibility: "public",
      resourceType: "image",
      format: "jpg",
    });
    expect(uploadStream.mock.calls[0][0]).toMatchObject({ format: "jpg" });
  });

  it("deletes images by public_id without extension and raw assets with it", async () => {
    const { client, destroy } = mockClient();
    const driver = new CloudinaryStorageDriver(config(), { client });
    await driver.delete("planthaat/development/products/u1/abc.webp", "public");
    expect(destroy).toHaveBeenCalledWith(
      "planthaat/development/products/u1/abc",
      expect.objectContaining({ resource_type: "image", type: "upload" }),
    );
    await driver.delete("planthaat/development/private/seller-docs/doc-1.pdf", "private");
    expect(destroy).toHaveBeenLastCalledWith(
      "planthaat/development/private/seller-docs/doc-1.pdf",
      expect.objectContaining({ resource_type: "raw", type: "authenticated" }),
    );
  });

  it("returns a short-lived signed private URL", async () => {
    const { client, privateUrl } = mockClient();
    const driver = new CloudinaryStorageDriver(config(), { client, now: () => 1_000_000 });
    const url = await driver.getPrivateUrl("planthaat/development/private/seller-docs/doc-1.pdf");
    expect(url).toContain("res.cloudinary.com");
    expect(privateUrl).toHaveBeenCalledWith(
      "planthaat/development/private/seller-docs/doc-1.pdf",
      "",
      expect.objectContaining({
        type: "authenticated",
        resource_type: "raw",
        expires_at: 1_300,
      }),
    );
  });

  it("parses delivery URLs into public_id + resource type", () => {
    expect(
      parseCloudinaryUrl("https://res.cloudinary.com/c/image/upload/v17/planthaat/products/a/b.webp"),
    ).toEqual({ publicId: "planthaat/products/a/b", resourceType: "image" });
    expect(
      parseCloudinaryUrl("https://res.cloudinary.com/c/raw/upload/v17/planthaat/private/doc.pdf"),
    ).toEqual({ publicId: "planthaat/private/doc.pdf", resourceType: "raw" });
    expect(parseCloudinaryUrl("http://localhost:5000/uploads/images/x.webp")).toBeNull();
  });
});
