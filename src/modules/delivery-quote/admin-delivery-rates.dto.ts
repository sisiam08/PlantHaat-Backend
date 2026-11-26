import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

import { CourierQuoteSource, DhakaZone } from "../../generated/prisma/enums";

export class CacheQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  from?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  to?: number;

  @ApiPropertyOptional({ enum: CourierQuoteSource })
  @IsOptional()
  @IsEnum(CourierQuoteSource)
  source?: CourierQuoteSource;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  stale?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class OverrideInputDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fromSteadfastId!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  toSteadfastId!: number;

  @ApiProperty({ example: 0.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(600)
  weightStep!: number;

  @ApiProperty({ example: 65 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  charge!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lane?: string | null;
}

export class UpdateMappingDto {
  @ApiPropertyOptional({ nullable: true, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  steadfastLocationId?: number | null;
}

export class UpdateThanaDto {
  @ApiPropertyOptional({ enum: DhakaZone, nullable: true })
  @IsOptional()
  @IsEnum(DhakaZone)
  dhakaZone?: DhakaZone | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  nameBn?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: "Offer this thana to customers/sellers" })
  @IsOptional()
  @IsBoolean()
  selectableByCustomer?: boolean;
}

export class ImportOverridesDto {
  @ApiProperty()
  @IsString()
  csv!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class WarmUpDto {
  @ApiProperty()
  @IsString()
  shopId!: string;
}

