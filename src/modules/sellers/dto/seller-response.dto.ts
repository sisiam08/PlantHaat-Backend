import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  AreaScope,
  PayoutMethod,
  SellerDocumentType,
  SellerStatus,
  SellerType,
  ShopStatus,
} from "../../../generated/prisma/enums";

export class SellerShopRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: Object.values(ShopStatus) }) status!: ShopStatus;
}

export class SellerDocumentDto {
  @ApiProperty() id!: string;
  @ApiProperty() sellerProfileId!: string;
  @ApiProperty({ enum: Object.values(SellerDocumentType) }) type!: SellerDocumentType;
  @ApiProperty() fileKey!: string;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class SellerApplicationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: Object.values(SellerType) }) sellerType!: SellerType;
  @ApiProperty() businessName!: string;
  @ApiProperty() contactPhone!: string;
  @ApiProperty({ nullable: true, type: String }) tradeLicenseNo!: string | null;
  @ApiProperty() businessAddress!: string;
  @ApiProperty({ enum: Object.values(SellerStatus) }) status!: SellerStatus;
  @ApiProperty({ nullable: true, type: String }) rejectionReason!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) submittedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) reviewedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) verifiedAt!: string | null;
  @ApiProperty({ type: [SellerDocumentDto] }) documents!: SellerDocumentDto[];
  @ApiProperty({ type: SellerShopRefDto, nullable: true }) shop!: SellerShopRefDto | null;
}

export class SellerShopDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) logoUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) bannerUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) district!: string | null;
  @ApiProperty({ nullable: true, type: String }) address!: string | null;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" })
  latitude!: string | null;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" })
  longitude!: string | null;
  @ApiProperty({ enum: Object.values(ShopStatus) }) status!: ShopStatus;
  @ApiProperty() isOnVacation!: boolean;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) vacationUntil!: string | null;
  @ApiProperty({ nullable: true, type: String }) vacationMessage!: string | null;
  @ApiProperty({ type: String, description: "Decimal as string" }) ratingAvg!: string;
  @ApiProperty() ratingCount!: number;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) approvedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class DistrictRefDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty() nameBn!: string;
  @ApiProperty() division!: string;
  @ApiPropertyOptional({ enum: Object.values(AreaScope) }) areaScope?: AreaScope;
}

export class DeliveryZoneDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isNationwide!: boolean;
  @ApiProperty({ type: String, description: "Decimal as string" }) charge!: string;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" })
  freeDeliveryAbove!: string | null;
  @ApiProperty() estimatedDaysMin!: number;
  @ApiProperty() estimatedDaysMax!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [DistrictRefDto] }) districts!: DistrictRefDto[];
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class SellerPayoutAccountDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: Object.values(PayoutMethod) }) method!: PayoutMethod;
  @ApiProperty() accountName!: string;
  @ApiProperty() accountMasked!: string;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}
