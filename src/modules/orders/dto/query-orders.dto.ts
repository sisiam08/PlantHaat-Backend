import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsIn, IsOptional } from "class-validator";

import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { OrderStatus } from "../../../generated/prisma/enums";

export const CUSTOMER_ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "FAILED_DELIVERY",
  "PARTIAL",
] as const;

export type CustomerOrderStatusFilter = (typeof CUSTOMER_ORDER_STATUSES)[number];

export class QueryOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  /** Customer-facing overall status (includes computed PARTIAL). */
  @ApiPropertyOptional({ enum: CUSTOMER_ORDER_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_ORDER_STATUSES)
  overallStatus?: CustomerOrderStatusFilter;

  /**
   * `summary` returns only the fields an admin list needs (no status history,
   * payments or delivery proofs). Additive: omitting it keeps the full response.
   */
  @ApiPropertyOptional({ enum: ["summary"] })
  @IsOptional()
  @IsIn(["summary"])
  view?: "summary";
}
