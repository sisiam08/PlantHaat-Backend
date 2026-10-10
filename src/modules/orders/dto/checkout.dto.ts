import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

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
}
