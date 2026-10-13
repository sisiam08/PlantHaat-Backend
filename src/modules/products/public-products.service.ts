import { createHash } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { CursorPaginatedResult, PaginatedResult } from "../../common/types/paginated";
import { paginate } from "../../common/types/paginated";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { resolveDeliveryZone } from "../orders/delivery-zone.resolver";
import type { QueryProductsDto } from "./dto/query-products.dto";
import {
  buildCursorWhere,
  cursorOrderBy,
  decodeProductCursor,
  encodeProductCursor,
  type CursorRow,
} from "./product-cursor";
import {
  cursorPage,
  type CursorPayload,
  decodeCursor,
  defaultRandomSeed,
  InvalidCursorError,
  rankIds,
} from "./random-feed";

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

const RANDOM_CACHE_TTL_MS = 45 * 1000;
const RANDOM_CACHE_MAX_ENTRIES = 500;

interface ProductListRow {
  id: string;
  name: string;
  nameBn: string | null;
  slug: string;
  minPrice: unknown;
  maxPrice: unknown;
  inStock: boolean;
  ratingAvg: unknown;
  ratingCount: number;
  soldCount: number;
  images: { url: string; altText: string | null }[];
  shop: { id: string; name: string; slug: string };
  category: { id: string; name: string; nameBn: string | null; slug: string };
}

@Injectable()
export class PublicProductsService {
  private readonly logger = new Logger(PublicProductsService.name);
  private readonly randomIdCache = new Map<string, { ids: string[]; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: QueryProductsDto,
    shopId?: string,
  ): Promise<PaginatedResult<unknown> | CursorPaginatedResult<unknown>> {
    if (query.sort === "random") {
      return this.listRandom(query, shopId);
    }
    if (query.pagination === "cursor") {
      return this.listCursor(query, shopId);
    }
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

    return paginate(rows.map((product) => this.toListItem(product)), total, page, limit);
  }

  /**
   * Cursor pagination for every deterministic sort: `(sortKey(s), id)` keyset
   * conditions with an opaque base64url cursor bound to the sort — positional
   * offset pagination stays available (deprecated) for sitemap/internal use.
   */
  private async listCursor(
    query: QueryProductsDto,
    shopId?: string,
  ): Promise<CursorPaginatedResult<unknown>> {
    const limit = query.limit ?? 20;
    const sort = query.sort ?? "newest";

    let decoded: ReturnType<typeof decodeProductCursor> | null = null;
    if (query.cursor) {
      try {
        decoded = decodeProductCursor(query.cursor, sort);
      } catch (error) {
        if (error instanceof InvalidCursorError) {
          throw AppException.badRequest(
            ErrorCode.INVALID_CURSOR,
            `Invalid cursor for sort ${sort}`,
          );
        }
        throw error;
      }
    }

    const where = await this.buildWhere(query, shopId);
    const keyset: Prisma.ProductWhereInput = decoded
      ? buildCursorWhere(sort, decoded)
      : {};

    const includeTotal = query.includeTotal === true && decoded === null;
    const [rows, count] = await Promise.all([
      this.prisma.product.findMany({
        where: { AND: [where, keyset] },
        orderBy: cursorOrderBy(sort),
        take: limit,
        include: LIST_ITEM_INCLUDE,
      }),
      includeTotal ? this.prisma.product.count({ where }) : Promise.resolve(undefined),
    ]);

    const last = rows.at(-1) as unknown as CursorRow | undefined;
    const hasMore = rows.length === limit && Boolean(last);
    const nextCursor = hasMore && last ? encodeProductCursor(sort, last) : null;

    const meta: {
      limit: number;
      nextCursor: string | null;
      hasMore: boolean;
      total?: number;
    } = { limit, nextCursor, hasMore };
    if (count !== undefined) {
      meta.total = count;
    }

    return {
      data: rows.map((product) =>
        this.toListItem(product as unknown as ProductListRow),
      ),
      meta,
    };
  }

  private async listRandom(
    query: QueryProductsDto,
    shopId?: string,
  ): Promise<CursorPaginatedResult<unknown>> {
    const limit = query.limit ?? 20;
    const seed = query.seed ?? defaultRandomSeed();

    let cursor: CursorPayload | undefined;
    if (query.cursor) {
      try {
        cursor = decodeCursor(query.cursor);
      } catch (error) {
        if (error instanceof InvalidCursorError) {
          throw AppException.badRequest(ErrorCode.INVALID_CURSOR, "Invalid cursor");
        }
        throw error;
      }
    }

    const where = await this.buildWhere(query, shopId);
    const ids = await this.getMatchingIds(this.randomCacheKey(query, shopId), where);
    const page = cursorPage(rankIds(seed, ids), limit, cursor);

    let data: unknown[] = [];
    if (page.ids.length > 0) {
      const rows = await this.prisma.product.findMany({
        where: { id: { in: page.ids } },
        include: LIST_ITEM_INCLUDE,
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      data = page.ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [this.toListItem(row)] : [];
      });
    }

    return { data, meta: { limit, nextCursor: page.nextCursor, hasMore: page.hasMore } };
  }

  private async getMatchingIds(key: string, where: Prisma.ProductWhereInput): Promise<string[]> {
    const now = Date.now();
    const cached = this.randomIdCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.ids;
    }
    const rows = await this.prisma.product.findMany({ where, select: { id: true } });
    const ids = rows.map((row) => row.id);
    if (this.randomIdCache.size >= RANDOM_CACHE_MAX_ENTRIES) {
      this.sweepRandomCache(now);
    }
    this.randomIdCache.set(key, { ids, expiresAt: now + RANDOM_CACHE_TTL_MS });
    return ids;
  }

  private randomCacheKey(query: QueryProductsDto, shopId?: string): string {
    return createHash("sha256")
      .update(
        JSON.stringify({
          q: query.q ?? null,
          category: query.category ?? null,
          shopSlug: shopId ? null : (query.shop ?? null),
          shopId: shopId ?? null,
          minPrice: query.minPrice ?? null,
          maxPrice: query.maxPrice ?? null,
          light: query.light ?? null,
          difficulty: query.difficulty ?? null,
          isIndoor: query.isIndoor ?? null,
          isPetSafe: query.isPetSafe ?? null,
          inStock: query.inStock ?? null,
          deliversTo: query.deliversTo ?? null,
        }),
      )
      .digest("hex");
  }

  private sweepRandomCache(now: number): void {
    for (const [key, entry] of this.randomIdCache) {
      if (entry.expiresAt <= now) {
        this.randomIdCache.delete(key);
      }
    }
  }

  @OnEvent("product.changed", { async: true })
  @OnEvent("product.moderated", { async: true })
  invalidateRandomCache(): void {
    this.randomIdCache.clear();
  }

  private toListItem(product: ProductListRow): unknown {
    return {
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
    };
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
            isOnVacation: true,
            sellerProfile: { select: { verifiedAt: true } },
          },
        },
        category: { select: { id: true, name: true, nameBn: true, slug: true } },
      },
    });
    if (!product) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Product not found");
    }

    // View counting moved to POST /products/:id/view (deduped per IP+window) so
    // cached/prerendered pages do not inflate counts.
    const { sellerProfile, ...shop } = product.shop;
    return {
      ...product,
      shop: {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        logoUrl: shop.logoUrl,
        district: shop.district,
        verified: sellerProfile.verifiedAt !== null,
        ratingAvg: shop.ratingAvg,
        ratingCount: shop.ratingCount,
        isOnVacation: shop.isOnVacation,
      },
    };
  }

  async getRelated(slug: string, limit: number) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: "ACTIVE", deletedAt: null, shop: PUBLIC_SHOP_FILTER },
      select: { id: true, categoryId: true, shopId: true, category: { select: { parentId: true } } },
    });
    if (!product) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Product not found");
    }

    const visibleInStock: Prisma.ProductWhereInput = {
      status: "ACTIVE",
      deletedAt: null,
      inStock: true,
      shop: PUBLIC_SHOP_FILTER,
      id: { not: product.id },
    };

    const siblingCategoryIds = await this.siblingCategoryIds(product.categoryId, product.category.parentId);

    const tiers: string[][] = [];
    tiers.push(
      await this.candidateIds({ ...visibleInStock, categoryId: product.categoryId }),
    );
    if (siblingCategoryIds.length > 0) {
      tiers.push(await this.candidateIds({ ...visibleInStock, categoryId: { in: siblingCategoryIds } }));
    }
    tiers.push(await this.candidateIds({ ...visibleInStock, shopId: product.shopId }));
    tiers.push(await this.candidateIds(visibleInStock));

    const seed = `${product.id}:${todayIsoDate()}`;
    const seen = new Set<string>([product.id]);
    const orderedIds: string[] = [];
    for (const tier of tiers) {
      const ranked = rankIds(seed, tier);
      for (const item of ranked) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        orderedIds.push(item.id);
        if (orderedIds.length >= limit) break;
      }
      if (orderedIds.length >= limit) break;
    }

    if (orderedIds.length === 0) return [];
    const rows = await this.prisma.product.findMany({
      where: { id: { in: orderedIds } },
      include: LIST_ITEM_INCLUDE,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return orderedIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [this.toListItem(row)] : [];
    });
  }

  private async siblingCategoryIds(categoryId: string, parentId: string | null): Promise<string[]> {
    const siblings = await this.prisma.category.findMany({
      where: { parentId, id: { not: categoryId }, isActive: true },
      select: { id: true },
    });
    return siblings.map((category) => category.id);
  }

  private async candidateIds(where: Prisma.ProductWhereInput): Promise<string[]> {
    const rows = await this.prisma.product.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((row) => row.id);
  }

  async getDeliveryQuote(slug: string, districtId: number) {
    const shop = await this.prisma.shop.findFirst({
      where: { slug, ...PUBLIC_SHOP_FILTER },
      select: { id: true },
    });
    if (!shop) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Shop not found");
    }

    const district = await this.prisma.district.findUnique({
      where: { id: districtId },
      select: { id: true },
    });
    if (!district) {
      throw AppException.unprocessable(ErrorCode.VALIDATION_FAILED, "Unknown district");
    }

    const zone = await resolveDeliveryZone(this.prisma, shop.id, districtId);
    if (!zone) {
      return {
        deliverable: false,
        charge: null,
        freeDeliveryAbove: null,
        estimatedDaysMin: null,
        estimatedDaysMax: null,
        zoneName: null,
        codAvailable: false,
      };
    }

    return {
      deliverable: true,
      charge: zone.charge.toString(),
      freeDeliveryAbove: zone.freeDeliveryAbove === null ? null : zone.freeDeliveryAbove.toString(),
      estimatedDaysMin: zone.estimatedDaysMin,
      estimatedDaysMax: zone.estimatedDaysMax,
      zoneName: zone.name,
      codAvailable: true,
    };
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

  async listShopProducts(
    slug: string,
    query: QueryProductsDto,
  ): Promise<PaginatedResult<unknown> | CursorPaginatedResult<unknown>> {
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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
