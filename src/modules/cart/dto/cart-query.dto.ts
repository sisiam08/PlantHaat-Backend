import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class CartQueryDto {
  @ApiPropertyOptional({ description: "District id to estimate delivery charges" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  districtId?: number;
}
