import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";

import { PaymentMethod } from "../../../generated/prisma/enums";

export class CheckoutDto {
  @ApiProperty()
  @IsUUID()
  addressId!: string;

  @ApiProperty({ enum: PaymentMethod, default: PaymentMethod.COD })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod = PaymentMethod.COD;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({
    example: 1250.5,
    description:
      "Grand total the customer saw on the cart. When it no longer matches, checkout returns 409 PRICE_CHANGED and applies nothing.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedGrandTotal?: number;

  @ApiPropertyOptional({
    example: 120,
    description:
      "Delivery total the customer saw on the cart. A mismatch returns 409 DELIVERY_CHARGE_CHANGED with the new amounts.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedDeliveryTotal?: number;
}
