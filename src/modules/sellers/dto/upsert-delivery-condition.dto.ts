import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";

import { DeliveryPaymentMode } from "../../../generated/prisma/enums";

export class UpsertDeliveryConditionDto {
  @ApiPropertyOptional({
    example: 60,
    description:
      "Legacy seller charge. Stored for history only; courier pricing is authoritative.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  charge?: number;

  @ApiPropertyOptional({ example: 1500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freeDeliveryAbove?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  estimatedDaysMin?: number;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  estimatedDaysMax?: number;

  @ApiProperty({ enum: DeliveryPaymentMode })
  @IsEnum(DeliveryPaymentMode)
  paymentMode!: DeliveryPaymentMode;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  freeDeliveryEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
