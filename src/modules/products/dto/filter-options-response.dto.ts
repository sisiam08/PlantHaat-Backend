import { ApiProperty } from "@nestjs/swagger";

import { CareDifficulty, LightRequirement } from "../../../generated/prisma/enums";

class PriceBoundsDto {
  @ApiProperty({ type: Number, nullable: true, example: 50 })
  min!: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 4500 })
  max!: number | null;
}

export class FilterOptionsResponseDto {
  @ApiProperty({ type: PriceBoundsDto })
  price!: PriceBoundsDto;

  @ApiProperty({ enum: LightRequirement, isArray: true })
  light!: LightRequirement[];

  @ApiProperty({ enum: CareDifficulty, isArray: true })
  difficulty!: CareDifficulty[];
}
