import { ApiProperty } from "@nestjs/swagger";

export class HealthCheckDto {
  @ApiProperty({ example: "ok" }) status!: "ok";
  @ApiProperty({ example: "up", description: "Liveness includes a database round-trip" })
  database!: "up";
  @ApiProperty() latencyMs!: number;
  @ApiProperty() uptimeSeconds!: number;
  @ApiProperty({ type: String, format: "date-time" }) timestamp!: string;
}
