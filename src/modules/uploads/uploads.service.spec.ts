import { jest } from "@jest/globals";

import type { PrismaService } from "../../prisma/prisma.service";
import { UploadPurpose } from "./dto/upload-image.dto";
import type { StorageService } from "./storage/storage.types";
import { UploadsService } from "./uploads.service";

type MockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockFn = (): MockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEElEQVQImWMQCdCAIwbiOADidAjBP8yuuwAAAABJRU5ErkJggg==",
  "base64",
);

function file(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "plant.png",
    encoding: "7bit",
    mimetype: "image/png",
    size: png.length,
    buffer: png,
    destination: "",
    filename: "",
    path: "",
    stream: undefined as never,
    ...overrides,
  };
}

function setup() {
  const storage = {
    put: mockFn(),
    delete: mockFn(),
    getPublicUrl: jest.fn(() => ""),
    getPrivateUrl: mockFn(),
    deleteByUrl: mockFn(),
  } as unknown as StorageService;
  const prisma = {
    uploadedAsset: {
      create: mockFn().mockResolvedValue({}),
      updateMany: mockFn().mockResolvedValue({ count: 1 }),
      deleteMany: mockFn().mockResolvedValue({ count: 1 }),
    },
  } as unknown as PrismaService;
  (prisma as unknown as { $transaction: (fn: (tx: PrismaService) => unknown) => unknown }).$transaction = (
    fn,
  ) => fn(prisma);
  return { service: new UploadsService(storage, prisma), storage, prisma };
}

describe("UploadsService", () => {
  it("stores a processed product image through the storage driver and tracks it", async () => {
    const { service, storage, prisma } = setup();
    const put = storage.put as unknown as MockFn;
    put.mockResolvedValue({
      key: "planthaat/products/user-1/key",
      url: "https://res.cloudinary.com/demo/image/upload/v1/planthaat/products/user-1/key.webp",
      resourceType: "image",
    });

    const result = await service.uploadImage(file(), UploadPurpose.PRODUCT, "user-1");

    expect(result.url).toContain("res.cloudinary.com");
    const input = put.mock.calls[0][0] as {
      key: string;
      contentType: string;
      visibility: string;
      resourceType: string;
    };
    expect(input.key).toMatch(/^products\/user-1\/[0-9a-f-]+\.webp$/);
    expect(input.contentType).toBe("image/webp");
    expect(input.visibility).toBe("public");
    expect(input.resourceType).toBe("image");
    expect(prisma.uploadedAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        publicId: "planthaat/products/user-1/key",
        purpose: UploadPurpose.PRODUCT,
        ownerId: "user-1",
        status: "PENDING",
      }),
    });
  });

  it("propagates a storage failure instead of falling back to local disk", async () => {
    const { service, storage, prisma } = setup();
    (storage.put as unknown as MockFn).mockRejectedValue(new Error("cloudinary unavailable"));

    await expect(service.uploadImage(file(), UploadPurpose.PRODUCT, "user-1")).rejects.toThrow(
      "cloudinary unavailable",
    );
    expect(prisma.uploadedAsset.create).not.toHaveBeenCalled();
  });

  it("marks uploaded URLs as attached once an entity persists them", async () => {
    const { service, prisma } = setup();
    await service.attachAssets(["https://res.cloudinary.com/demo/a.webp", null, undefined]);
    expect(prisma.uploadedAsset.updateMany).toHaveBeenCalledWith({
      where: { url: { in: ["https://res.cloudinary.com/demo/a.webp"] }, status: "PENDING" },
      data: { status: "ATTACHED", attachedAt: expect.any(Date) },
    });
  });

  it("deletes replaced assets best-effort and removes their tracking rows", async () => {
    const { service, storage, prisma } = setup();
    await service.deleteAssets(["https://res.cloudinary.com/demo/a.webp"]);
    expect(storage.deleteByUrl).toHaveBeenCalledWith("https://res.cloudinary.com/demo/a.webp");
    expect(prisma.uploadedAsset.deleteMany).toHaveBeenCalledWith({
      where: { url: "https://res.cloudinary.com/demo/a.webp" },
    });
  });

  it("never throws when storage cleanup fails", async () => {
    const { service, storage } = setup();
    (storage.deleteByUrl as unknown as MockFn).mockRejectedValue(new Error("network"));
    await expect(service.deleteByUrl("https://res.cloudinary.com/demo/a.webp")).resolves.toBeUndefined();
  });
});
