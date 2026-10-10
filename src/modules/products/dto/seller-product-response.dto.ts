import { ApiProperty } from "@nestjs/swagger";

import {
  CareDifficulty,
  LightRequirement,
  ProductStatus,
  WateringFrequency,
} from "../../../generated/prisma/enums";

export class SellerProductCategorySummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class SellerProductCategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty() slug!: string;
}

export class SellerVariantSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) price!: string;
  @ApiProperty() stockQty!: number;
  @ApiProperty() isActive!: boolean;
}

export class SellerProductImageSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() url!: string;
  @ApiProperty() isPrimary!: boolean;
}

export class SellerProductImageDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ nullable: true, type: String }) altText!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class SellerVariantDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty({ nullable: true, type: String }) sku!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) sizeLabel!: string | null;
  @ApiProperty({ nullable: true, type: Number }) heightCm!: number | null;
  @ApiProperty({ nullable: true, type: String }) potType!: string | null;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" })
  potSizeInch!: string | null;
  @ApiProperty({ type: String, description: "Decimal as string" }) price!: string;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" })
  compareAtPrice!: string | null;
  @ApiProperty() stockQty!: number;
  @ApiProperty() lowStockThreshold!: number;
  @ApiProperty({ nullable: true, type: Number }) weightGrams!: number | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
}

export class SellerProductListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() shopId!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) scientificName!: string | null;
  @ApiProperty() description!: string;
  @ApiProperty({ nullable: true, type: String }) careInstructions!: string | null;
  @ApiProperty({ nullable: true, enum: Object.values(LightRequirement) })
  lightRequirement!: LightRequirement | null;
  @ApiProperty({ nullable: true, enum: Object.values(WateringFrequency) })
  wateringFrequency!: WateringFrequency | null;
  @ApiProperty({ nullable: true, enum: Object.values(CareDifficulty) })
  careDifficulty!: CareDifficulty | null;
  @ApiProperty({ nullable: true, type: Boolean }) isIndoor!: boolean | null;
  @ApiProperty({ nullable: true, type: Boolean }) isPetSafe!: boolean | null;
  @ApiProperty({ nullable: true, type: Number }) matureHeightCm!: number | null;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty({ type: Object, nullable: true }) careDetails!: Record<string, unknown> | null;
  @ApiProperty({ enum: Object.values(ProductStatus) }) status!: ProductStatus;
  @ApiProperty({ nullable: true, type: String }) rejectionReason!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) publishedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" })
  minPrice!: string | null;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" })
  maxPrice!: string | null;
  @ApiProperty() inStock!: boolean;
  @ApiProperty({ type: String, description: "Decimal as string" }) ratingAvg!: string;
  @ApiProperty() ratingCount!: number;
  @ApiProperty() soldCount!: number;
  @ApiProperty() viewCount!: number;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) deletedAt!: string | null;
  @ApiProperty({ type: [SellerVariantSummaryDto] }) variants!: SellerVariantSummaryDto[];
  @ApiProperty({ type: [SellerProductImageSummaryDto] })
  images!: SellerProductImageSummaryDto[];
  @ApiProperty({ type: SellerProductCategorySummaryDto })
  category!: SellerProductCategorySummaryDto;
}

export class SellerProductDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty({ nullable: true, type: String }) scientificName!: string | null;
  @ApiProperty() slug!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ nullable: true, type: String }) careInstructions!: string | null;
  @ApiProperty({ nullable: true, enum: Object.values(LightRequirement) })
  lightRequirement!: LightRequirement | null;
  @ApiProperty({ nullable: true, enum: Object.values(WateringFrequency) })
  wateringFrequency!: WateringFrequency | null;
  @ApiProperty({ nullable: true, enum: Object.values(CareDifficulty) })
  careDifficulty!: CareDifficulty | null;
  @ApiProperty({ nullable: true, type: Boolean }) isIndoor!: boolean | null;
  @ApiProperty({ nullable: true, type: Boolean }) isPetSafe!: boolean | null;
  @ApiProperty({ nullable: true, type: Number }) matureHeightCm!: number | null;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty({ type: Object, nullable: true }) careDetails!: Record<string, unknown> | null;
  @ApiProperty({ enum: Object.values(ProductStatus) }) status!: ProductStatus;
  @ApiProperty({ nullable: true, type: String }) rejectionReason!: string | null;
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
  @ApiProperty({ type: SellerProductCategoryDto }) category!: SellerProductCategoryDto;
  @ApiProperty({ type: [SellerVariantDto] }) variants!: SellerVariantDto[];
  @ApiProperty({ type: [SellerProductImageDto] }) images!: SellerProductImageDto[];
}

export class VariantStockDto {
  @ApiProperty() id!: string;
  @ApiProperty() stockQty!: number;
  @ApiProperty() lowStockThreshold!: number;
}
