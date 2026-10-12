import { ApiProperty } from "@nestjs/swagger";

import { ProductStatus, ShopStatus } from "../../../generated/prisma/enums";

export class WishlistedShopRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: Object.values(ShopStatus) }) status!: ShopStatus;
}

export class WishlistedProductDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: Object.values(ProductStatus) }) status!: ProductStatus;
  @ApiProperty() inStock!: boolean;
  @ApiProperty({ type: String, description: "Decimal as string" }) minPrice!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) maxPrice!: string;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  deletedAt!: string | null;
  @ApiProperty({ type: WishlistedShopRefDto }) shop!: WishlistedShopRefDto;
}

export class WishlistItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ description: "False when the product or its shop is unavailable" })
  available!: boolean;
  @ApiProperty({ type: WishlistedProductDto }) product!: WishlistedProductDto;
}

export class WishlistAddedDto {
  @ApiProperty({ example: true }) added!: boolean;
}
