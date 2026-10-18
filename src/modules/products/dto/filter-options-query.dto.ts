import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class FilterOptionsQueryDto {
  @ApiPropertyOptional({ description: "Category slug (includes child categories)" })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: "Free-text search to narrow the option set" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
