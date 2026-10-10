import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";

import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";
import { OrderStatus } from "../../../generated/prisma/enums";

export class QueryOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
