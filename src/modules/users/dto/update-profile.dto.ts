import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

import { BD_PHONE_REGEX } from "../../auth/dto/register.dto";

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: "Rahim Uddin" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: "01712345678" })
  @IsOptional()
  @IsString()
  @Matches(BD_PHONE_REGEX, { message: "phone must be a valid Bangladeshi mobile number" })
  phone?: string;
}
