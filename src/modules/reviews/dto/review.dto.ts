import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

/** Product reviews list: cursor or offset, with rating/photo filters and sort. */
export class QueryProductReviewsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ["offset", "cursor"], default: "offset" })
  @IsOptional()
  @IsIn(["offset", "cursor"])
  pagination?: "offset" | "cursor";

  @ApiPropertyOptional({ description: "Opaque cursor (cursor mode)" })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: "Only reviews with at least one photo" })
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  withPhotos?: boolean;

  @ApiPropertyOptional({ enum: ["newest", "highest", "lowest"], default: "newest" })
  @IsOptional()
  @IsIn(["newest", "highest", "lowest"])
  sort?: "newest" | "highest" | "lowest";
}

export class CreateReviewDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  images?: string[];
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  images?: string[];
}

export class ReplyReviewDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reply!: string;
}

export class ReportReviewDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ResolveReviewReportDto {
  @ApiProperty({ description: "true hides the review, false keeps it" })
  @IsBoolean()
  hide!: boolean;
}

export class QueryReviewsDto extends PaginationQueryDto {}
