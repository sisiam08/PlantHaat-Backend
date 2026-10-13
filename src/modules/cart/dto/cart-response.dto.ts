import { ApiProperty } from "@nestjs/swagger";

export class CartItemIssueDto {
  @ApiProperty({ description: "Issue code, e.g. OUT_OF_STOCK, INSUFFICIENT_STOCK" })
  code!: string;
  @ApiProperty({ required: false, nullable: true, type: Number })
  available?: number;
}

export class CartItemDto {
  @ApiProperty() variantId!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() variantName!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) image!: string | null;
  @ApiProperty({ type: String, description: "Decimal as string" }) unitPrice!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty({ type: String, description: "Decimal as string" }) lineTotal!: string;
  @ApiProperty() stockQty!: number;
  @ApiProperty({ type: [CartItemIssueDto] }) issues!: CartItemIssueDto[];
}

export class CartShopInfoDto {
  @ApiProperty({ nullable: true, type: String }) logoUrl!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: "Shop's own district name (seller-entered, not localized)",
  })
  district!: string | null;
  @ApiProperty({ description: "True when the seller profile is APPROVED" })
  verified!: boolean;
}

export class CartShopGroupDto {
  @ApiProperty() shopId!: string;
  @ApiProperty() shopName!: string;
  @ApiProperty() shopSlug!: string;
  @ApiProperty({ type: CartShopInfoDto }) shop!: CartShopInfoDto;
  @ApiProperty({
    nullable: true,
    type: String,
    description: "Delivery charge as a decimal string; null when no districtId passed",
  })
  deliveryCharge!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "Free-delivery threshold of the matched zone as a decimal string; null when none or no districtId",
  })
  freeDeliveryAbove!: string | null;
  @ApiProperty({ type: String, description: "Decimal as string" }) subtotal!: string;
  @ApiProperty({ type: [CartItemDto] }) items!: CartItemDto[];
  @ApiProperty({ nullable: true, type: Number, description: "Present when a zone matched" })
  estimatedDaysMin!: number | null;
  @ApiProperty({ nullable: true, type: Number, description: "Present when a zone matched" })
  estimatedDaysMax!: number | null;
}

export class CartViewDto {
  @ApiProperty({ type: [CartShopGroupDto] }) shops!: CartShopGroupDto[];
  @ApiProperty({ type: String, description: "Decimal as string" }) subtotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) deliveryTotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) grandTotal!: string;
  @ApiProperty() itemCount!: number;
}
