import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

import { InventoryReason } from "../../../generated/prisma/enums";

export class AdjustStockDto {
  @ApiPropertyOptional({ example: 10, description: "Relative change (can be negative)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-100000)
  @Max(100000)
  delta?: number;

  @ApiPropertyOptional({ example: 25, description: "Absolute new stock value" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  set?: number;

  @ApiPropertyOptional({ enum: InventoryReason, default: InventoryReason.ADJUSTMENT })
  @IsOptional()
  @IsEnum(InventoryReason)
  reason?: InventoryReason;
}
