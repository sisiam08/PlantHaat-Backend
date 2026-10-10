import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { ProductStatus } from "../../../generated/prisma/enums";

export class QueryAdminProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;
}
