import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class BulkCancelOrdersDto {
  @ApiProperty({ example: "Seller suspended" })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ default: true, description: "Return ordered quantities to stock" })
  @IsOptional()
  @IsBoolean()
  restock?: boolean;
}
