import { jest } from "@jest/globals";

import type { AppConfigService } from "../../config/app-config.service";
import type { PrismaService } from "../../prisma/prisma.service";
import { CategoriesService } from "./categories.service";

type MockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockFn = (): MockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

function createPrismaMock() {
  return {
    category: { findMany: mockFn() },
    product: { groupBy: mockFn() },
  };
}

const categories = [
  { id: "root", name: "Plants", nameBn: null, slug: "plants", imageUrl: null, parentId: null, sortOrder: 0 },
  { id: "child", name: "Indoor", nameBn: null, slug: "indoor", imageUrl: null, parentId: "root", sortOrder: 0 },
];

describe("CategoriesService", () => {
  it("builds the tree, rolls up counts and caches the result", async () => {
    const prisma = createPrismaMock();
    prisma.category.findMany.mockResolvedValue(categories);
    prisma.product.groupBy.mockResolvedValue([
      { categoryId: "root", _count: { _all: 2 } },
      { categoryId: "child", _count: { _all: 3 } },
    ]);

    const service = new CategoriesService(prisma as unknown as PrismaService, { isTest: false } as AppConfigService);

    const first = await service.getTree();
    expect(first).toHaveLength(1);
    expect(first[0].productCount).toBe(5); // 2 own + 3 child
    expect(first[0].children).toHaveLength(1);
    expect(prisma.category.findMany).toHaveBeenCalledTimes(1);

    const second = await service.getTree();
    expect(second).toEqual(first);
    expect(prisma.category.findMany).toHaveBeenCalledTimes(1); // served from cache
    expect(prisma.product.groupBy).toHaveBeenCalledTimes(1);
  });

  it("re-queries after invalidation", async () => {
    const prisma = createPrismaMock();
    prisma.category.findMany.mockResolvedValue(categories);
    prisma.product.groupBy.mockResolvedValue([]);

    const service = new CategoriesService(prisma as unknown as PrismaService, { isTest: false } as AppConfigService);
    await service.getTree();
    service.invalidate();
    await service.getTree();

    expect(prisma.category.findMany).toHaveBeenCalledTimes(2);
  });
});
