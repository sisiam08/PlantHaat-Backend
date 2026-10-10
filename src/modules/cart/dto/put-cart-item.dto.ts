import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsUUID, Max, Min } from "class-validator";

export class PutCartItemDto {
  @ApiProperty()
  @IsUUID()
  variantId!: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}
