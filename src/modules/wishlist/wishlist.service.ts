import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import { PrismaService } from "../../prisma/prisma.service";
import type { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async add(userId: string, productId: string): Promise<{ added: true }> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Product not found");
    }
    await this.prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      update: {},
      create: { userId, productId },
    });
    return { added: true };
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, productId } });
  }

  async list(userId: string, query: PaginationQueryDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.wishlistItem.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              nameBn: true,
              slug: true,
              status: true,
              inStock: true,
              minPrice: true,
              maxPrice: true,
              deletedAt: true,
              shop: { select: { id: true, name: true, slug: true, status: true } },
            },
          },
        },
      }),
      this.prisma.wishlistItem.count({ where }),
    ]);
    const data = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      available:
        row.product.deletedAt === null &&
        row.product.status === "ACTIVE" &&
        row.product.shop.status === "ACTIVE",
      product: row.product,
    }));
    return paginate(data, total, page, limit);
  }
}
