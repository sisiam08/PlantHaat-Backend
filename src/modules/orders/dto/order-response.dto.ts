import { ApiProperty } from "@nestjs/swagger";

export class OrderDetailDto {
  @ApiProperty({ nullable: true, type: String }) id!: string | null;
  @ApiProperty({ nullable: true, type: String }) orderNumber!: string | null;
  @ApiProperty({ nullable: true, type: String, example: "PENDING" }) overallStatus!: string | null;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" }) status!: string | null;
  @ApiProperty({ type: String, description: "Decimal as string" }) subtotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) deliveryTotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) grandTotal!: string;
  @ApiProperty({ nullable: true, type: String }) paymentMethod!: string | null;
  @ApiProperty({ nullable: true, type: String }) paymentStatus!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) placedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) createdAt!: string | null;
  @ApiProperty({ type: [Object], description: "Shop orders with items, status history and payments" })
  shopOrders?: Record<string, unknown>[];
  @ApiProperty({ type: [Object] }) items?: Record<string, unknown>[];
  @ApiProperty({ type: [Object] }) statusHistory?: Record<string, unknown>[];
  @ApiProperty({ type: [Object] }) payments?: Record<string, unknown>[];
}
