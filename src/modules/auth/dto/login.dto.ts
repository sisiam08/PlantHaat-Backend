import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MaxLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "customer@example.com" })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: "Str0ngPass" })
  @IsString()
  @MaxLength(72)
  password!: string;
}
