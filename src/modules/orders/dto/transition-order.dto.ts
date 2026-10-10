import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

import { OrderStatus } from "../../../generated/prisma/enums";

export class TransitionOrderDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  courierName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  estimatedDeliveryFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  estimatedDeliveryTo?: string;

  @ApiPropertyOptional({ description: "Restock on cancellation (default false)" })
  @IsOptional()
  @IsBoolean()
  restock?: boolean;
}
