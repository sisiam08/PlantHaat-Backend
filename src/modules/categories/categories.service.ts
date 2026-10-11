import { Injectable } from "@nestjs/common";

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

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async getTree(): Promise<CategoryTreeNode[]> {
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
