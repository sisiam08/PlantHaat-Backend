import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsIn, IsOptional } from "class-validator";

import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { OrderStatus } from "../../../generated/prisma/enums";

export class QueryOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /**
   * `summary` returns only the fields an admin list needs (no status history,
   * payments or delivery proofs). Additive: omitting it keeps the full response.
   */
  @ApiPropertyOptional({ enum: ["summary"] })
  @IsOptional()
  @IsIn(["summary"])
  view?: "summary";
}
