import { ApiProperty } from "@nestjs/swagger";

export class SuggestedProductDto {
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String, description: "Primary image URL" })
  image!: string | null;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" })
  minPrice!: string | null;
  @ApiProperty() inStock!: boolean;
}

export class SuggestedCategoryDto {
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) imageUrl!: string | null;
}

export class SuggestedShopDto {
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) logoUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) district!: string | null;
}

export class SearchSuggestDto {
  @ApiProperty({ type: [SuggestedProductDto] }) products!: SuggestedProductDto[];
  @ApiProperty({ type: [SuggestedCategoryDto] }) categories!: SuggestedCategoryDto[];
  @ApiProperty({ type: [SuggestedShopDto] }) shops!: SuggestedShopDto[];
}
