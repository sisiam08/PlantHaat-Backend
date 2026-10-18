import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { AppConfigService } from "../../config/app-config.service";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface CategoryTreeNode {
  id: string;
  name: string;
  nameBn: string | null;
  slug: string;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  productCount: number;
  children: CategoryTreeNode[];
}

const VISIBLE_PRODUCT_FILTER = {
  status: "ACTIVE",
  deletedAt: null,
  inStock: true,
  shop: { status: "ACTIVE", sellerProfile: { status: "APPROVED" } },
  category: { isActive: true },
} satisfies Prisma.ProductWhereInput;

/**
 * The tree is read on every public page (header, home, filters) but only
 * changes on category/product mutations, so it is cached in memory for a short
 * window to absorb traffic and Neon cold-starts. `productCount` is a `groupBy`
 * aggregate — cheap, but still one round-trip we do not need per request.
 */
const CACHE_TTL_MS = 45 * 1000;

@Injectable()
export class CategoriesService {
  private readonly cache = new Map<"tree", { value: CategoryTreeNode[]; expiresAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async getTree(): Promise<CategoryTreeNode[]> {
    // E2E suites reset the schema directly (bypassing the mutation events),
    // so caching is disabled in tests; the cache is unit-tested separately.
    if (this.config.isTest) {
      return this.buildTree();
    }
    const now = Date.now();
    const cached = this.cache.get("tree");
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
    const tree = await this.buildTree();
    this.cache.set("tree", { value: tree, expiresAt: now + CACHE_TTL_MS });
    return tree;
  }

  @OnEvent("product.changed", { async: true })
  @OnEvent("product.moderated", { async: true })
  @OnEvent("category.changed", { async: true })
  invalidate(): void {
    this.cache.clear();
  }

  private async buildTree(): Promise<CategoryTreeNode[]> {
    const [categories, counts] = await Promise.all([
      this.prisma.category.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          nameBn: true,
          slug: true,
          imageUrl: true,
          parentId: true,
          sortOrder: true,
        },
      }),
      this.prisma.product.groupBy({
        by: ["categoryId"],
        where: VISIBLE_PRODUCT_FILTER,
        _count: { _all: true },
      }),
    ]);

    const ownCounts = new Map(counts.map((row) => [row.categoryId, row._count._all]));

    const nodes = new Map<string, CategoryTreeNode>();
    for (const category of categories) {
      nodes.set(category.id, {
        ...category,
        productCount: ownCounts.get(category.id) ?? 0,
        children: [],
      });
    }

    const roots: CategoryTreeNode[] = [];
    for (const node of nodes.values()) {
      const parent = node.parentId ? nodes.get(node.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // A parent's count includes its children's visible products.
    const rollUp = (node: CategoryTreeNode): number => {
      let total = node.productCount;
      for (const child of node.children) {
        total += rollUp(child);
      }
      node.productCount = total;
      return total;
    };
    for (const root of roots) {
      rollUp(root);
    }
    return roots;
  }
}
