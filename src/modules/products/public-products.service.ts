import { Injectable, Logger } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { PaginatedResult } from "../../common/types/paginated";
import { paginate } from "../../common/types/paginated";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { QueryProductsDto } from "./dto/query-products.dto";

const PUBLIC_SHOP_FILTER = {
  status: "ACTIVE",
  sellerProfile: { status: "APPROVED" },
} satisfies Prisma.ShopWhereInput;

const LIST_ITEM_INCLUDE = {
  images: {
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    take: 1,
    select: { url: true, altText: true },
  },
  shop: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, nameBn: true, slug: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class PublicProductsService {
  private readonly logger = new Logger(PublicProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryProductsDto, shopId?: string): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where = await this.buildWhere(query, shopId);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: this.buildOrderBy(query),
        skip,
        take: limit,
        include: LIST_ITEM_INCLUDE,
      }),
      this.prisma.product.count({ where }),
    ]);

    const data = rows.map((product) => ({
      id: product.id,
      name: product.name,
      nameBn: product.nameBn,
      slug: product.slug,
      minPrice: product.minPrice,
      maxPrice: product.maxPrice,
      inStock: product.inStock,
      ratingAvg: product.ratingAvg,
      ratingCount: product.ratingCount,
      soldCount: product.soldCount,
      image: product.images[0] ?? null,
      shop: product.shop,
      category: product.category,
    }));
    return paginate(data, total, page, limit);
  }

  async getBySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: "ACTIVE", deletedAt: null, shop: PUBLIC_SHOP_FILTER },
      include: {
        variants: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
        images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
        shop: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            ratingAvg: true,
            ratingCount: true,
            district: true,
            address: true,
            isOnVacation: true,
          },
        },
        category: { select: { id: true, name: true, nameBn: true, slug: true } },
      },
    });
    if (!product) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Product not found");
    }

    void this.prisma.product
      .update({ where: { id: product.id }, data: { viewCount: { increment: 1 } } })
      .catch((error: unknown) => {
        this.logger.warn(`Failed to increment viewCount for ${product.id}: ${String(error)}`);
      });

    return product;
  }

  async listShops(query: { page?: number; limit?: number }): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.ShopWhereInput = {
      status: "ACTIVE",
      sellerProfile: { status: "APPROVED" },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shop.findMany({
        where,
        orderBy: [{ ratingAvg: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          district: true,
          ratingAvg: true,
          ratingCount: true,
          isOnVacation: true,
          _count: { select: { products: { where: { status: "ACTIVE", deletedAt: null } } } },
        },
      }),
      this.prisma.shop.count({ where }),
    ]);
    const data = rows.map(({ _count, ...shop }) => ({ ...shop, productCount: _count.products }));
    return paginate(data, total, page, limit);
  }

  async getShopBySlug(slug: string) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, ...PUBLIC_SHOP_FILTER },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logoUrl: true,
        bannerUrl: true,
        phone: true,
        district: true,
        address: true,
        ratingAvg: true,
        ratingCount: true,
        isOnVacation: true,
        vacationMessage: true,
        createdAt: true,
      },
    });
    if (!shop) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Shop not found");
    }
    return shop;
  }

  async listShopProducts(slug: string, query: QueryProductsDto): Promise<PaginatedResult<unknown>> {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, ...PUBLIC_SHOP_FILTER },
      select: { id: true },
    });
    if (!shop) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Shop not found");
    }
    return this.list({ ...query, shop: undefined }, shop.id);
  }

  async getHome() {
    const now = new Date();
    const banners = await this.prisma.banner.findMany({
      where: {
        isActive: true,
        placement: "HOME_HERO",
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { sortOrder: "asc" },
    });

    const sections = await this.prisma.homepageSection.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    const resolved = await Promise.all(
      sections.map(async (section) => ({
        key: section.key,
        title: section.title,
        titleBn: section.titleBn,
        type: section.type,
        items: await this.resolveSectionItems(section.type, section.itemIds),
      })),
    );

    return { banners, sections: resolved };
  }

  private async resolveSectionItems(type: string, itemIds: string[]): Promise<unknown[]> {
    switch (type) {
      case "FEATURED_CATEGORIES":
        return this.prisma.category.findMany({
          where: { id: { in: itemIds }, isActive: true },
          select: { id: true, name: true, nameBn: true, slug: true, imageUrl: true },
        });
      case "FEATURED_SHOPS":
        return this.prisma.shop.findMany({
          where: { id: { in: itemIds }, ...PUBLIC_SHOP_FILTER },
          select: { id: true, name: true, slug: true, logoUrl: true, ratingAvg: true },
        });
      case "FEATURED_PRODUCTS":
      case "NEW_ARRIVALS":
        return this.prisma.product.findMany({
          where: { id: { in: itemIds }, status: "ACTIVE", deletedAt: null },
          take: 20,
          include: LIST_ITEM_INCLUDE,
        });
      default:
        return [];
    }
  }

  private async buildWhere(
    query: QueryProductsDto,
    shopId?: string,
  ): Promise<Prisma.ProductWhereInput> {
    const and: Prisma.ProductWhereInput[] = [];

    const shopFilter: Prisma.ShopWhereInput = { ...PUBLIC_SHOP_FILTER };
    if (query.shop) {
      shopFilter.slug = query.shop;
    }

    if (query.deliversTo) {
      const shops = await this.prisma.shop.findMany({
        where: {
          ...PUBLIC_SHOP_FILTER,
          OR: [
            { deliveryZones: { some: { isActive: true, isNationwide: true } } },
            {
              deliveryZones: {
                some: { isActive: true, districts: { some: { districtId: query.deliversTo } } },
              },
            },
          ],
        },
        select: { id: true },
      });
      and.push({ shopId: { in: shops.map((s) => s.id) } });
    }

    if (query.category) {
      const category = await this.prisma.category.findUnique({
        where: { slug: query.category },
        select: { id: true, children: { select: { id: true } } },
      });
      if (!category) {
        and.push({ id: "__no_match__" });
      } else {
        and.push({ categoryId: { in: [category.id, ...category.children.map((c) => c.id)] } });
      }
    }

    if (query.q) {
      and.push({
        OR: [
          { name: { contains: query.q, mode: "insensitive" } },
          { nameBn: { contains: query.q, mode: "insensitive" } },
          { scientificName: { contains: query.q, mode: "insensitive" } },
          { tags: { has: query.q } },
        ],
      });
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      and.push({
        minPrice: {
          ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
          ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
        },
      });
    }

    if (query.light) and.push({ lightRequirement: query.light });
    if (query.difficulty) and.push({ careDifficulty: query.difficulty });
    if (query.isIndoor !== undefined) and.push({ isIndoor: query.isIndoor });
    if (query.isPetSafe !== undefined) and.push({ isPetSafe: query.isPetSafe });
    if (query.inStock) and.push({ inStock: true });

    return {
      status: "ACTIVE",
      deletedAt: null,
      ...(shopId ? { shopId } : {}),
      shop: shopId ? undefined : shopFilter,
      AND: and,
    };
  }

  private buildOrderBy(query: QueryProductsDto): Prisma.ProductOrderByWithRelationInput[] {
    switch (query.sort) {
      case "price_asc":
        return [{ minPrice: "asc" }, { createdAt: "desc" }];
      case "price_desc":
        return [{ minPrice: "desc" }, { createdAt: "desc" }];
      case "popular":
        return [{ soldCount: "desc" }, { createdAt: "desc" }];
      case "rating":
        return [{ ratingAvg: "desc" }, { ratingCount: "desc" }];
      case "newest":
      default:
        return [{ publishedAt: "desc" }, { createdAt: "desc" }];
    }
  }
}
