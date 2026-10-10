import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CancellationRequestDto {
  @ApiProperty({ example: "Changed my mind" })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RespondCancellationDto {
  @ApiProperty()
  approve!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
