import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export const RELATED_DEFAULT_LIMIT = 6;
export const RELATED_MAX_LIMIT = 12;

export class RelatedProductsQueryDto {
  @ApiPropertyOptional({ default: RELATED_DEFAULT_LIMIT, minimum: 1, maximum: RELATED_MAX_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(RELATED_MAX_LIMIT)
  limit?: number = RELATED_DEFAULT_LIMIT;
}
