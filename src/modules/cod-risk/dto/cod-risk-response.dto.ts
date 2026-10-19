import { ApiProperty } from "@nestjs/swagger";

import { CodRiskStatus } from "../../../generated/prisma/enums";

export class CodRiskProfileDto {
  @ApiProperty() id!: string;
  @ApiProperty() phoneNormalized!: string;
  @ApiProperty() failedCount!: number;
  @ApiProperty() deliveredCount!: number;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  lastEventAt!: string | null;
  @ApiProperty({ enum: Object.values(CodRiskStatus) }) status!: CodRiskStatus;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ nullable: true, type: String }) setById!: string | null;
  @ApiProperty() isWhitelisted!: boolean;
  @ApiProperty({ nullable: true, type: String }) addressFingerprint!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
}
