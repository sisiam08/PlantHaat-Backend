import { ApiProperty } from "@nestjs/swagger";

export class ShopSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class CategorySummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty() slug!: string;
}

export class ImageSummaryDto {
  @ApiProperty() url!: string;
  @ApiProperty({ nullable: true, type: String }) altText!: string | null;
}

export class ProductListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string", example: "850.00" })
  minPrice!: string | null;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" })
  maxPrice!: string | null;
  @ApiProperty() inStock!: boolean;
  @ApiProperty({ type: String, description: "Decimal as string" }) ratingAvg!: string;
  @ApiProperty() ratingCount!: number;
  @ApiProperty() soldCount!: number;
  @ApiProperty({ type: ImageSummaryDto, nullable: true }) image!: ImageSummaryDto | null;
  @ApiProperty({ type: ShopSummaryDto }) shop!: ShopSummaryDto;
  @ApiProperty({ type: CategorySummaryDto }) category!: CategorySummaryDto;
}

export class ProductDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty({ nullable: true, type: String }) scientificName!: string | null;
  @ApiProperty() slug!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ nullable: true, type: String }) careInstructions!: string | null;
  @ApiProperty({ nullable: true, type: String }) lightRequirement!: string | null;
  @ApiProperty({ nullable: true, type: String }) wateringFrequency!: string | null;
  @ApiProperty({ nullable: true, type: String }) careDifficulty!: string | null;
  @ApiProperty({ nullable: true, type: Boolean }) isIndoor!: boolean | null;
  @ApiProperty({ nullable: true, type: Boolean }) isPetSafe!: boolean | null;
  @ApiProperty({ nullable: true, type: Number }) matureHeightCm!: number | null;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty({ type: Object, nullable: true }) careDetails!: Record<string, unknown> | null;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" })
  minPrice!: string | null;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" })
  maxPrice!: string | null;
  @ApiProperty() inStock!: boolean;
  @ApiProperty({ type: String, description: "Decimal as string" }) ratingAvg!: string;
  @ApiProperty() ratingCount!: number;
  @ApiProperty() soldCount!: number;
  @ApiProperty() viewCount!: number;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) publishedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: [Object] }) variants!: Record<string, unknown>[];
  @ApiProperty({ type: [Object] }) images!: Record<string, unknown>[];
  @ApiProperty({ type: Object }) shop!: Record<string, unknown>;
  @ApiProperty({ type: CategorySummaryDto }) category!: CategorySummaryDto;
}
