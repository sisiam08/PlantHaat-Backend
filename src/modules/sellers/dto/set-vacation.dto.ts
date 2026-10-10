import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

export class SetVacationDto {
  @ApiPropertyOptional({ example: "2026-12-31T00:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  until?: string;

  @ApiPropertyOptional({ example: "Back after Eid" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}
