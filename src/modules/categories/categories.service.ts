import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";

export interface CategoryTreeNode {
  id: string;
  name: string;
  nameBn: string | null;
  slug: string;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  children: CategoryTreeNode[];
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async getTree(): Promise<CategoryTreeNode[]> {
    const categories = await this.prisma.category.findMany({
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
    });

    const nodes = new Map<string, CategoryTreeNode>();
    for (const category of categories) {
      nodes.set(category.id, { ...category, children: [] });
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
    return roots;
  }
}
