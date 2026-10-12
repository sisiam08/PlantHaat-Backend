import { ApiProperty } from "@nestjs/swagger";

import { PaymentMethod, RefundStatus } from "../../../generated/prisma/enums";

export class RefundShopOrderRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() shopOrderNumber!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) commissionAmount!: string;
}

export class RefundDto {
  @ApiProperty() id!: string;
  @ApiProperty() shopOrderId!: string;
  @ApiProperty({ nullable: true, type: String }) paymentId!: string | null;
  @ApiProperty({ nullable: true, type: String }) complaintId!: string | null;
  @ApiProperty({ type: String, description: "Decimal as string" }) amount!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: Object.values(RefundStatus) }) status!: RefundStatus;
  @ApiProperty({ nullable: true, enum: Object.values(PaymentMethod) })
  method!: PaymentMethod | null;
  @ApiProperty({ nullable: true, type: String }) reference!: string | null;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty() requestedById!: string;
  @ApiProperty({ nullable: true, type: String }) processedById!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  processedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: RefundShopOrderRefDto, description: "Present in admin list responses" })
  shopOrder?: RefundShopOrderRefDto;
}

export class RefundProcessedDto {
  @ApiProperty({ example: true }) processed!: boolean;
}
