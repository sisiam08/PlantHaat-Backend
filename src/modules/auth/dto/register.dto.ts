import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_PATTERN,
  PASSWORD_POLICY_MESSAGE,
} from "../../../common/utils/password";

export const BD_PHONE_REGEX = /^(?:\+?88)?01[3-9]\d{8}$/;

export class RegisterDto {
  @ApiProperty({ example: "customer@example.com" })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: "Str0ngPass",
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_POLICY_MESSAGE })
  password!: string;

  @ApiProperty({ example: "Rahim Uddin" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: "01712345678" })
  @IsOptional()
  @IsString()
  @Matches(BD_PHONE_REGEX, { message: "phone must be a valid Bangladeshi mobile number" })
  phone?: string;
}
