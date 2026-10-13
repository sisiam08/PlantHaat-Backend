import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import type { SearchSuggestQueryDto } from "./dto/search-suggest-query.dto";

const CACHE_TTL_MS = 45 * 1000;
const CACHE_MAX_ENTRIES = 300;

interface CacheEntry {
  expiresAt: number;
  payload: unknown;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async suggest(query: SearchSuggestQueryDto) {
    const normalized = (query.q ?? "").trim().toLowerCase();
    if (normalized.length < 2 || normalized.length > 50) {
      return { products: [], categories: [], shops: [] };
    }

    const cached = this.cache.get(normalized);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.payload;
    }

    const payload = await this.compute(normalized);

    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      for (const [key, entry] of this.cache) {
        if (entry.expiresAt <= now) {
          this.cache.delete(key);
        }
      }
      if (this.cache.size >= CACHE_MAX_ENTRIES) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) {
          this.cache.delete(oldest);
        }
      }
    }
    this.cache.set(normalized, { expiresAt: now + CACHE_TTL_MS, payload });
    return payload;
  }

  invalidate(): void {
    this.cache.clear();
  }

  private async compute(q: string) {
    const pattern = `%${q.replace(/[%_\\]/g, (character) => `\\${character}`)}%`;

    // Ranked products: prefix hits first, then trigram similarity (full-string
    // and word similarity); only visible rows; in-stock preferred below the
    // ranking bands. All inputs are parameterized.
    const products = await this.prisma.$queryRaw<
      {
        name: string;
        name_bn: string | null;
        slug: string;
        image_url: string | null;
        min_price: string | null;
        instock: boolean;
      }[]
    >`
      WITH scored AS (
        SELECT
          p."name",
          p."nameBn" AS "name_bn",
          p."slug",
          (SELECT i."url" FROM "ProductImage" i
            WHERE i."productId" = p."id"
            ORDER BY i."isPrimary" DESC, i."sortOrder" ASC LIMIT 1) AS "image_url",
          p."minPrice"::text AS "min_price",
          p."inStock" AS "instock",
          GREATEST(
            GREATEST(
              similarity(p."name", ${q}),
              word_similarity(${q}, p."name")),
            GREATEST(
              similarity(COALESCE(p."nameBn", ''), ${q}),
              word_similarity(${q}, COALESCE(p."nameBn", ''))),
            similarity(p."scientificName", ${q}),
            CASE
              WHEN EXISTS (
                SELECT 1 FROM unnest(p."tags") AS tag
                WHERE similarity(tag, ${q}) > 0.05 OR tag ILIKE ${pattern}
              ) THEN 0.4
              ELSE 0
            END
          ) AS sim,
          (COALESCE(p."name" ILIKE ${pattern}, FALSE)
            OR COALESCE(p."nameBn" ILIKE ${pattern}, FALSE)
            OR COALESCE(p."scientificName" ILIKE ${pattern}, FALSE)) AS prefix_hit
        FROM "Product" p
        JOIN "Shop" s ON s."id" = p."shopId"
        JOIN "SellerProfile" sp ON sp."id" = s."sellerProfileId"
        WHERE p."status" = 'ACTIVE'
          AND p."deletedAt" IS NULL
          AND s."status" = 'ACTIVE'
          AND sp."status" = 'APPROVED'
      )
      SELECT "name", "name_bn", "slug", "image_url", "min_price", "instock"
      FROM scored
      WHERE "prefix_hit" = TRUE OR "sim" > 0.05
      ORDER BY "prefix_hit" DESC, "sim" DESC, "instock" DESC, "name" ASC
      LIMIT 4
    `;

    const categories = await this.prisma.$queryRaw<
      { name: string; name_bn: string | null; slug: string; image_url: string | null }[]
    >`
      SELECT "name", "nameBn" AS "name_bn", "slug", "imageUrl" AS "image_url"
      FROM "Category"
      WHERE "isActive" = TRUE
        AND (
          "name" ILIKE ${pattern}
          OR similarity("name", ${q}) > 0.1
          OR similarity(COALESCE("nameBn", ''), ${q}) > 0.1
        )
      ORDER BY ("name" ILIKE ${pattern}) DESC,
        GREATEST(similarity("name", ${q}), similarity(COALESCE("nameBn", ''), ${q})) DESC,
        "name" ASC
      LIMIT 2
    `;

    const shops = await this.prisma.$queryRaw<
      { name: string; slug: string; logo_url: string | null; district: string | null }[]
    >`
      SELECT s."name", s."slug", s."logoUrl" AS "logo_url", s."district"
      FROM "Shop" s
      JOIN "SellerProfile" sp ON sp."id" = s."sellerProfileId"
      WHERE s."status" = 'ACTIVE'
        AND sp."status" = 'APPROVED'
        AND (similarity(s."name", ${q}) > 0.09 OR s."name" ILIKE ${pattern})
      ORDER BY (s."name" ILIKE ${pattern}) DESC, similarity(s."name", ${q}) DESC, s."name" ASC
      LIMIT 2
    `;

    return {
      products: products.map((row) => ({
        name: row.name,
        nameBn: row.name_bn,
        slug: row.slug,
        image: row.image_url,
        minPrice: row.min_price,
        inStock: row.instock,
      })),
      categories: categories.map((row) => ({
        name: row.name,
        nameBn: row.name_bn,
        slug: row.slug,
        imageUrl: row.image_url,
      })),
      shops: shops.map((row) => ({
        name: row.name,
        slug: row.slug,
        logoUrl: row.logo_url,
        district: row.district,
      })),
    };
  }
}
