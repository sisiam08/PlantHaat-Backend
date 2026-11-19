import { jest } from "@jest/globals";

import type { AppConfigService } from "../../config/app-config.service";
import type { PrismaService } from "../../prisma/prisma.service";
import type { SettingsService } from "../settings/settings.service";
import type { StorageService } from "./storage/storage.types";
import type { UploadReferencesService } from "./upload-references.service";
import { UploadsMaintenanceService } from "./uploads-maintenance.service";

type MockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockFn = (): MockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

function setup(overrides: {
  rows?: unknown[];
  reference?: { table: string; column: string } | null;
  driver?: string;
  folder?: string;
} = {}) {
  const prisma = {
    uploadedAsset: {
      findMany: mockFn().mockResolvedValue(overrides.rows ?? []),
      update: mockFn().mockResolvedValue({}),
      delete: mockFn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
  const settings = {
    getNumber: mockFn().mockResolvedValue(7),
  } as unknown as SettingsService;
  const config = {
    values: {
      NODE_ENV: "test",
      STORAGE_DRIVER: overrides.driver ?? "cloudinary",
      CLOUDINARY_FOLDER: overrides.folder ?? "planthaat/test",
    },
  } as unknown as AppConfigService;
  const references = {
    findReference: mockFn().mockResolvedValue(overrides.reference ?? null),
  } as unknown as UploadReferencesService;
  const storage = {
    delete: mockFn().mockResolvedValue(undefined),
  } as unknown as StorageService;
  const service = new UploadsMaintenanceService(
    prisma,
    settings,
    config,
    references,
    storage,
  );
  return { service, prisma, settings, references, storage };
}

const asset = (overrides: Record<string, unknown> = {}) => ({
  id: "a1",
  publicId: "planthaat/test/products/u1/old",
  resourceType: "image",
  url: "https://res.cloudinary.com/c/image/upload/planthaat/test/products/u1/old.webp",
  ...overrides,
});

describe("UploadsMaintenanceService", () => {
  it("relinks a PENDING asset that is still referenced and never deletes it", async () => {
    const { service, prisma, storage } = setup({
      rows: [asset()],
      reference: { table: "ProductImage", column: "url" },
    });
    const summary = await service.purgeOrphans();
    expect(summary.relinked).toBe(1);
    expect(summary.deleted).toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.uploadedAsset.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { status: "ATTACHED", attachedAt: expect.any(Date) },
    });
  });

  it("deletes an unreferenced old public asset in the current prefix", async () => {
    const { service, prisma, storage } = setup({ rows: [asset()] });
    const summary = await service.purgeOrphans();
    expect(summary.deleted).toBe(1);
    expect(storage.delete).toHaveBeenCalledWith("planthaat/test/products/u1/old", "public");
    expect(prisma.uploadedAsset.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
  });

  it("never auto-deletes private assets", async () => {
    const { service, prisma, storage } = setup({
      rows: [asset({ publicId: "planthaat/test/private/seller-docs/x.pdf", url: null })],
    });
    const summary = await service.purgeOrphans();
    expect(summary.skippedPrivate).toBe(1);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.uploadedAsset.delete).not.toHaveBeenCalled();
  });

  it("does not touch assets outside the current environment prefix", async () => {
    const { service, storage } = setup({
      rows: [asset({ publicId: "planthaat/dev/products/u1/old" })],
    });
    const summary = await service.purgeOrphans();
    expect(summary.skippedForeignPrefix).toBe(1);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("dry-run reports would-delete without changing storage or the database", async () => {
    const { service, prisma, storage } = setup({ rows: [asset()] });
    const summary = await service.purgeOrphans({ dryRun: true });
    expect(summary.wouldDelete).toBe(1);
    expect(summary.deleted).toBe(0);
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.uploadedAsset.delete).not.toHaveBeenCalled();
    expect(prisma.uploadedAsset.update).not.toHaveBeenCalled();
  });

  it("uses the configurable grace period with a 24h minimum", async () => {
    const { service, settings, prisma } = setup({ rows: [] });
    (settings.getNumber as unknown as MockFn).mockResolvedValue(0);
    const summary = await service.purgeOrphans();
    expect(summary.graceDays).toBe(1);
    const query = (prisma.uploadedAsset.findMany as unknown as MockFn).mock.calls[0][0] as {
      where: { createdAt: { lt: Date } };
    };
    expect(query.where.createdAt.lt).toBeInstanceOf(Date);
  });
});
