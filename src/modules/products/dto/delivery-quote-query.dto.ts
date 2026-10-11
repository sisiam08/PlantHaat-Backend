import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class DeliveryQuoteQueryDto {
  @ApiProperty({ description: "Destination district id", minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  districtId!: number;
}
