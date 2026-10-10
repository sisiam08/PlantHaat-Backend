import { ApiProperty } from "@nestjs/swagger";

import { PaymentMethod, PaymentStatus } from "../../../generated/prisma/enums";

export class PaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() orderNumber!: string;
  @ApiProperty({ nullable: true, type: String }) shopOrderId!: string | null;
  @ApiProperty({ nullable: true, type: String }) shopOrderNumber!: string | null;
  @ApiProperty({ type: String, description: "Decimal as string" }) amount!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: Object.values(PaymentMethod) }) method!: PaymentMethod;
  @ApiProperty({ nullable: true, type: String }) provider!: string | null;
  @ApiProperty({ enum: Object.values(PaymentStatus) }) status!: PaymentStatus;
  @ApiProperty({ nullable: true, type: String }) providerTxnId!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) paidAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) failedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) failureReason!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}
