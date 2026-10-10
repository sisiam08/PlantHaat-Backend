import { ApiProperty } from "@nestjs/swagger";

export class CartViewDto {
  @ApiProperty({ type: [Object], description: "Items grouped by shop with per-item issues" })
  shops!: Record<string, unknown>[];
  @ApiProperty({ type: String, description: "Decimal as string" }) subtotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) deliveryTotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) grandTotal!: string;
  @ApiProperty() itemCount!: number;
}
