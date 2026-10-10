import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class RejectSellerDto {
  @ApiProperty({ example: "Trade license photo is not readable" })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
