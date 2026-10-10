import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

import { SellerType } from "../../../generated/prisma/enums";
import { BD_PHONE_REGEX, RegisterDto } from "./register.dto";

export class RegisterSellerDto extends RegisterDto {
  @ApiProperty({ example: "Green Valley Nursery" })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  businessName!: string;

  @ApiProperty({ example: "01712345678" })
  @IsString()
  @Matches(BD_PHONE_REGEX, { message: "contactPhone must be a valid Bangladeshi mobile number" })
  contactPhone!: string;

  @ApiPropertyOptional({ enum: SellerType, default: SellerType.NURSERY })
  @IsOptional()
  @IsEnum(SellerType)
  sellerType?: SellerType;

  @ApiPropertyOptional({ example: "Shop 12, Mirpur, Dhaka" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  businessAddress?: string;
}
