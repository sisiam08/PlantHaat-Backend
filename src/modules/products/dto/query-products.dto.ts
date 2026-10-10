import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

import { CareDifficulty, LightRequirement } from "../../../generated/prisma/enums";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

const toBoolean = ({ value }: { value: unknown }): boolean =>
  value === true || value === "true" || value === "1";

export const PRODUCT_SORTS = ["newest", "price_asc", "price_desc", "popular", "rating"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

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

  @ApiPropertyOptional({ enum: LightRequirement })
  @IsOptional()
  @IsEnum(LightRequirement)
  light?: LightRequirement;

  @ApiPropertyOptional({ enum: CareDifficulty })
  @IsOptional()
  @IsEnum(CareDifficulty)
  difficulty?: CareDifficulty;

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
}
