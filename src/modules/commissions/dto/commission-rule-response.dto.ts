import { ApiProperty } from "@nestjs/swagger";

import { CommissionScope } from "../../../generated/prisma/enums";

export class CommissionRuleDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: Object.values(CommissionScope) }) scope!: CommissionScope;
  @ApiProperty({ nullable: true, type: String }) categoryId!: string | null;
  @ApiProperty({ nullable: true, type: String }) sellerProfileId!: string | null;
  @ApiProperty({ type: String, description: "Decimal as string, e.g. \"5.00\"" })
  ratePercent!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: String, format: "date-time" }) effectiveFrom!: string;
  @ApiProperty({ nullable: true, type: String }) createdById!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}
