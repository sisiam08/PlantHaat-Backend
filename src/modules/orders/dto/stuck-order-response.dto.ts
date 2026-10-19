import { ApiProperty } from "@nestjs/swagger";

import { OrderStatus, ShopOrderKind } from "../../../generated/prisma/enums";

export class StuckOrderDto {
  @ApiProperty() id!: string;
  @ApiProperty() shopOrderNumber!: string;
  @ApiProperty({ enum: Object.values(ShopOrderKind) }) kind!: ShopOrderKind;
  @ApiProperty({ enum: Object.values(OrderStatus) }) status!: OrderStatus;
  @ApiProperty() shopId!: string;
  @ApiProperty() shopName!: string;
  @ApiProperty({ nullable: true, type: String }) confirmedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) packedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) shippedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) estimatedDeliveryTo!: string | null;
  @ApiProperty() stuckReminderCount!: number;
  @ApiProperty({ nullable: true, type: String }) stuckLastRemindedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) stuckFlaggedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) delayNotifiedAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) total!: string;
  @ApiProperty({ type: [Object] }) items!: Record<string, unknown>[];
  @ApiProperty({ type: Object }) order!: Record<string, unknown>;
  @ApiProperty({ type: Object }) shop!: Record<string, unknown>;
}
