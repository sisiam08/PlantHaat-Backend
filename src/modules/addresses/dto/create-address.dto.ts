import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { BD_PHONE_REGEX } from "../../auth/dto/register.dto";
import { CityScope } from "../../../generated/prisma/enums";

export class CreateAddressDto {
  @ApiPropertyOptional({ example: "Home" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @ApiProperty({ example: "Rahim Uddin" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  recipientName!: string;

  @ApiProperty({ example: "01712345678" })
  @IsString()
  @Matches(BD_PHONE_REGEX, { message: "phone must be a valid Bangladeshi mobile number" })
  phone!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  districtId!: number;

  @ApiProperty({ example: "Mirpur" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  area!: string;

  @ApiProperty({ example: "House 12, Road 5, Block B" })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  addressLine!: string;

  @ApiPropertyOptional({ example: "1216" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional({ enum: CityScope, description: "Only meaningful for metro districts (Dhaka)" })
  @IsOptional()
  @IsEnum(CityScope)
  cityScope?: CityScope;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
