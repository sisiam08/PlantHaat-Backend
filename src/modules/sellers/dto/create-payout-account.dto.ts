import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

import { PayoutMethod } from "../../../generated/prisma/enums";

export class CreatePayoutAccountDto {
  @ApiProperty({ enum: PayoutMethod })
  @IsEnum(PayoutMethod)
  method!: PayoutMethod;

  @ApiProperty({ example: "Green Valley Nursery" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  accountName!: string;

  @ApiProperty({ example: "01712345678" })
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  accountNumber!: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
