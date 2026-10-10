import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { toSlug, toUniqueSlug } from "../../common/utils/slug";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateCategoryDto, UpdateCategoryDto } from "./dto/category.dto";

@Injectable()
export class AdminCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true, children: true } } },
    });
  }

  async create(dto: CreateCategoryDto) {
    if (dto.parentId) {
      await this.assertParent(dto.parentId);
    }
    const slug = dto.slug
      ? await this.ensureUniqueSlug(toSlug(dto.slug))
      : await this.ensureUniqueSlug(toUniqueSlug(dto.name));
    return this.prisma.category.create({
      data: {
        name: dto.name.trim(),
        nameBn: dto.nameBn ?? null,
        slug,
        parentId: dto.parentId ?? null,
        imageUrl: dto.imageUrl ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.getOrThrow(id);
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          "A category cannot be its own parent",
        );
      }
      await this.assertParent(dto.parentId);
    }
    return this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.nameBn !== undefined ? { nameBn: dto.nameBn } : {}),
        ...(dto.slug !== undefined ? { slug: toSlug(dto.slug) } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);
    const products = await this.prisma.product.count({ where: { categoryId: id } });
    if (products > 0) {
      throw AppException.conflict(
        ErrorCode.CATEGORY_HAS_PRODUCTS,
        "This category has products; deactivate it instead",
      );
    }
    const children = await this.prisma.category.count({ where: { parentId: id } });
    if (children > 0) {
      throw AppException.conflict(
        ErrorCode.CATEGORY_HAS_PRODUCTS,
        "This category has sub-categories; remove them first",
      );
    }
    await this.prisma.category.delete({ where: { id } });
  }

  private async assertParent(parentId: string): Promise<void> {
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true },
    });
    if (!parent) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Unknown parent category");
    }
  }

  private async ensureUniqueSlug(slug: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
      const existing = await this.prisma.category.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }
    return toUniqueSlug(slug);
  }

  private async getOrThrow(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!category) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Category not found");
    }
    return category;
  }
}
