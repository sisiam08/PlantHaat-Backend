import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { CareDifficulty, LightRequirement } from "../../../generated/prisma/enums";
import { RANDOM_SEED_PATTERN } from "../random-feed";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

const toBoolean = ({ value }: { value: unknown }): boolean =>
  value === true || value === "true" || value === "1";

/**
 * Normalizes a filter value that may arrive as a repeated query param
 * (`light=A&light=B` → array) or a single comma-separated string
 * (`light=A,B`) into a trimmed, de-duplicated string array.
 */
const toStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const trimmed = String(entry).trim();
    if (trimmed.length > 0) {
      seen.add(trimmed);
    }
  }
  return seen.size > 0 ? [...seen] : undefined;
};

export const PRODUCT_SORTS = [
  "newest",
  "price_asc",
  "price_desc",
  "popular",
  "rating",
  "random",
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_PAGINATION_MODES = ["offset", "cursor"] as const;
export type ProductPaginationMode = (typeof PRODUCT_PAGINATION_MODES)[number];

export class QueryProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Search name, nameBn, scientificName or tags" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: "Category slug (includes child categories)" })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: "Shop slug" })
  @IsOptional()
  @IsString()
  shop?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    enum: LightRequirement,
    isArray: true,
    description: "Light requirement(s); repeat the param or use comma-separated values",
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsEnum(LightRequirement, { each: true })
  light?: LightRequirement[];

  @ApiPropertyOptional({
    enum: CareDifficulty,
    isArray: true,
    description: "Care difficulty(ies); repeat the param or use comma-separated values",
  })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsEnum(CareDifficulty, { each: true })
  difficulty?: CareDifficulty[];

  @ApiPropertyOptional({ description: "Only products rated at least this (1–5) with reviews" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ description: "Only products with a discounted variant" })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  onSale?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isIndoor?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPetSafe?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  inStock?: boolean;

  @ApiPropertyOptional({ description: "District id the shop must deliver to" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deliversTo?: number;

  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: "newest" })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort = "newest";

  @ApiPropertyOptional({
    description: "Seed for `sort=random` (1–64 chars of [A-Za-z0-9_-]); defaults to a 15-minute bucket",
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @Matches(RANDOM_SEED_PATTERN, {
    message: "seed must be 1–64 characters of [A-Za-z0-9_-]",
  })
  seed?: string;

  @ApiPropertyOptional({
    description:
      "Pagination mode for deterministic sorts: `offset` (deprecated; page/limit/total meta) or `cursor` (keyset `meta: {limit, nextCursor, hasMore, total?}`). `sort=random` always pages by cursor.",
    enum: PRODUCT_PAGINATION_MODES,
  })
  @IsOptional()
  @IsIn(PRODUCT_PAGINATION_MODES)
  pagination?: ProductPaginationMode;

  @ApiPropertyOptional({
    description:
      "Cursor-mode extra: include `meta.total` on the FIRST page (no cursor) for an 'N results' label.",
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeTotal?: boolean;

  @ApiPropertyOptional({ description: "Opaque cursor (`sort=random` or `pagination=cursor`)" })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}
