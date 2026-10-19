import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

import { AreaScope } from "../../../generated/prisma/enums";

export class DistrictAreaScopeDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  districtId!: number;

  @ApiProperty({ enum: AreaScope, default: AreaScope.ALL })
  @IsEnum(AreaScope)
  areaScope!: AreaScope;
}

export class CreateDeliveryZoneDto {
  @ApiProperty({ example: "Dhaka metro" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isNationwide?: boolean;

  @ApiPropertyOptional({ type: [Number], description: "District IDs (ignored when nationwide)" })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  districtIds?: number[];

  @ApiPropertyOptional({
    type: [DistrictAreaScopeDto],
    description:
      "Per-district area scope. When provided it replaces districtIds and allows CITY + OUTSIDE + ALL zones for the same district.",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DistrictAreaScopeDto)
  districtAreaScopes?: DistrictAreaScopeDto[];

  @ApiProperty({ example: 60 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  charge!: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freeDeliveryAbove?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  estimatedDaysMin?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  estimatedDaysMax?: number;
}
