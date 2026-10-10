import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import {
  CareDifficulty,
  LightRequirement,
  WateringFrequency,
} from "../../../generated/prisma/enums";

export class CreateProductDto {
  @ApiProperty()
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ example: "Monstera Deliciosa" })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: "মনস্টেরা" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameBn?: string;

  @ApiPropertyOptional({ example: "Monstera deliciosa" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  scientificName?: string;

  @ApiProperty({ example: "A popular tropical houseplant." })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  careInstructions?: string;

  @ApiPropertyOptional({ enum: LightRequirement })
  @IsOptional()
  @IsEnum(LightRequirement)
  lightRequirement?: LightRequirement;

  @ApiPropertyOptional({ enum: WateringFrequency })
  @IsOptional()
  @IsEnum(WateringFrequency)
  wateringFrequency?: WateringFrequency;

  @ApiPropertyOptional({ enum: CareDifficulty })
  @IsOptional()
  @IsEnum(CareDifficulty)
  careDifficulty?: CareDifficulty;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isIndoor?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPetSafe?: boolean;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  matureHeightCm?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  careDetails?: Record<string, unknown>;
}
