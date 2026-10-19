import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class SuspendDto {
  @ApiPropertyOptional({ example: "Repeated policy violations" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description: "Cancel all open shop orders of this seller as part of the suspension",
  })
  @IsOptional()
  @IsBoolean()
  cancelOpenOrders?: boolean;

  @ApiPropertyOptional({ description: "Reason recorded on the cancelled orders" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancelReason?: string;
}

