import { jest } from "@jest/globals";

import type { PrismaService } from "../../prisma/prisma.service";
import type { StorageService } from "./storage/storage.types";
import { UploadsMaintenanceService } from "./uploads-maintenance.service";

type MockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockFn = (): MockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

describe("UploadsMaintenanceService", () => {
  it("deletes PENDING assets older than 24h and keeps fresh ones", async () => {
    const oldRow = {
      id: "a1",
      publicId: "planthaat/dev/products/u1/old",
      resourceType: "image",
      url: "https://res.cloudinary.com/c/image/upload/old.webp",
    };
    const prisma = {
      uploadedAsset: {
        findMany: mockFn().mockResolvedValue([oldRow]),
        delete: mockFn().mockResolvedValue({}),
      },
    };
    const storage = { delete: mockFn().mockResolvedValue(undefined) } as unknown as StorageService;

    const service = new UploadsMaintenanceService(
      prisma as unknown as PrismaService,
      storage,
    );
    await service.purgeOrphans();

    const query = prisma.uploadedAsset.findMany.mock.calls[0][0] as {
      where: { status: string; createdAt: { lt: Date } };
      take: number;
    };
    expect(query.where.status).toBe("PENDING");
    expect(query.where.createdAt.lt).toBeInstanceOf(Date);
    expect(storage.delete).toHaveBeenCalledWith(oldRow.publicId, "public");
    expect(prisma.uploadedAsset.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
  });

  it("routes private-prefixed assets with private visibility", async () => {
    const prisma = {
      uploadedAsset: {
        findMany: mockFn().mockResolvedValue([
          { id: "p1", publicId: "planthaat/dev/private/seller-docs/x.pdf", resourceType: "raw" },
        ]),
        delete: mockFn().mockResolvedValue({}),
      },
    };
    const storage = { delete: mockFn().mockResolvedValue(undefined) } as unknown as StorageService;
    await new UploadsMaintenanceService(
      prisma as unknown as PrismaService,
      storage,
    ).purgeOrphans();
    expect(storage.delete).toHaveBeenCalledWith(
      "planthaat/dev/private/seller-docs/x.pdf",
      "private",
    );
  });
});
