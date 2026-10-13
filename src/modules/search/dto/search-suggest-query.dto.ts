import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SearchSuggestQueryDto {
  @ApiPropertyOptional({ description: "2–50 character search text", example: "monstera" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  q?: string;
}
