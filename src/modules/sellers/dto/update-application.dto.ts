import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

import { BD_PHONE_REGEX } from "../../auth/dto/register.dto";
import { SellerType } from "../../../generated/prisma/enums";

export class UpdateApplicationDto {
  @ApiPropertyOptional({ example: "Green Valley Nursery" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  businessName?: string;

  @ApiPropertyOptional({ enum: SellerType })
  @IsOptional()
  @IsEnum(SellerType)
  sellerType?: SellerType;

  @ApiPropertyOptional({ example: "01712345678" })
  @IsOptional()
  @IsString()
  @Matches(BD_PHONE_REGEX, { message: "contactPhone must be a valid Bangladeshi mobile number" })
  contactPhone?: string;

  @ApiPropertyOptional({ example: "Shop 12, Mirpur, Dhaka" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  businessAddress?: string;

  @ApiPropertyOptional({ example: "TRAD/12345" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  tradeLicenseNo?: string;
}
