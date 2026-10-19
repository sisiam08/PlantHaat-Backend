import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Min } from "class-validator";

import { CityScope } from "../../../generated/prisma/enums";

export class DeliveryQuoteQueryDto {
  @ApiProperty({ description: "Destination district id", minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  districtId!: number;

  @ApiPropertyOptional({ enum: CityScope, description: "Dhaka city/outside scope (optional)" })
  @IsOptional()
  @IsEnum(CityScope)
  cityScope?: CityScope;
}
