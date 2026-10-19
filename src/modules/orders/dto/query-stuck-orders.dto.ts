import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional } from "class-validator";

import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class QueryStuckOrdersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: "Also include currently overdue orders that are not flagged yet",
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  includeOverdue?: boolean;
}
