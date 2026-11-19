import { jest } from "@jest/globals";
import type { EventEmitter2 } from "@nestjs/event-emitter";

import type { PrismaService } from "../../prisma/prisma.service";
import type { UploadsService } from "../uploads/uploads.service";
import { AdminCategoriesService } from "./admin-categories.service";

type MockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockFn = (): MockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

function setup() {
  const prisma = {
    category: {
      findUnique: mockFn(),
      create: mockFn(),
      update: mockFn(),
      delete: mockFn(),
      count: mockFn().mockResolvedValue(0),
    },
    product: { count: mockFn().mockResolvedValue(0) },
  } as unknown as PrismaService;
  (prisma as unknown as { $transaction: (fn: (tx: PrismaService) => unknown) => unknown }).$transaction = (
    fn,
  ) => fn(prisma);
  const uploads = {
    attachAssetsInTransaction: mockFn().mockResolvedValue(undefined),
    deleteByUrl: mockFn().mockResolvedValue(undefined),
  } as unknown as UploadsService;
  const events = { emit: jest.fn() } as unknown as EventEmitter2;
  return { service: new AdminCategoriesService(prisma, uploads, events), prisma, uploads };
}

describe("AdminCategoriesService image tracking", () => {
  it("marks a created category image as attached", async () => {
    const { service, prisma, uploads } = setup();
    (prisma.category.findUnique as unknown as MockFn).mockResolvedValue(null);
    (prisma.category.create as unknown as MockFn).mockResolvedValue({
      id: "c1",
      imageUrl: "https://res.cloudinary.com/demo/categories/c1.webp",
    });

    await service.create({ name: "Indoor", imageUrl: "https://res.cloudinary.com/demo/categories/c1.webp" });

    expect(uploads.attachAssetsInTransaction).toHaveBeenCalledWith(
      prisma,
      ["https://res.cloudinary.com/demo/categories/c1.webp"],
    );
  });

  it("attaches the replacement and deletes the previous image only after the update", async () => {
    const { service, prisma, uploads } = setup();
    (prisma.category.findUnique as unknown as MockFn).mockResolvedValue({
      id: "c1",
      imageUrl: "https://res.cloudinary.com/demo/categories/old.webp",
    });
    (prisma.category.update as unknown as MockFn).mockResolvedValue({
      id: "c1",
      imageUrl: "https://res.cloudinary.com/demo/categories/new.webp",
    });

    await service.update("c1", { imageUrl: "https://res.cloudinary.com/demo/categories/new.webp" });

    expect(uploads.attachAssetsInTransaction).toHaveBeenCalledWith(
      prisma,
      ["https://res.cloudinary.com/demo/categories/new.webp"],
    );
    expect(uploads.deleteByUrl).toHaveBeenCalledWith(
      "https://res.cloudinary.com/demo/categories/old.webp",
    );
  });

  it("deletes the category image after the row is removed", async () => {
    const { service, prisma, uploads } = setup();
    (prisma.category.findUnique as unknown as MockFn).mockResolvedValue({
      id: "c1",
      imageUrl: "https://res.cloudinary.com/demo/categories/c1.webp",
    });

    await service.remove("c1");

    expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
    expect(uploads.deleteByUrl).toHaveBeenCalledWith(
      "https://res.cloudinary.com/demo/categories/c1.webp",
    );
  });
});
