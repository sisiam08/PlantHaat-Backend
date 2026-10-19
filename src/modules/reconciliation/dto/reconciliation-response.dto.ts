import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ReconciliationViolationDto {
  @ApiProperty({ example: "ORDER_TOTAL_MISMATCH" }) code!: string;
  @ApiProperty() entityType!: string;
  @ApiProperty() entityId!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional({ type: String }) expected?: string;
  @ApiPropertyOptional({ type: String }) actual?: string;
}

export class ReconciliationResponseDto {
  @ApiProperty({ type: String, format: "date-time" }) from!: string;
  @ApiProperty({ type: String, format: "date-time" }) to!: string;
  @ApiProperty({ description: "Number of entities/checks evaluated" }) checked!: number;
  @ApiProperty({ type: [ReconciliationViolationDto] }) violations!: ReconciliationViolationDto[];
}
