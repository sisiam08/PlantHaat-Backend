import { ApiProperty } from "@nestjs/swagger";

import {
  PayoutMethod,
  Role,
  SellerDocumentType,
  SellerStatus,
  SellerType,
  ShopStatus,
  UserStatus,
} from "../../../generated/prisma/enums";

/* ── Admin: users ──────────────────────────────────────────────── */

export class AdminUserListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ enum: Object.values(Role) }) role!: Role;
  @ApiProperty({ enum: Object.values(UserStatus) }) status!: UserStatus;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  emailVerifiedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  lastLoginAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class AdminSellerProfileRefDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: Object.values(SellerStatus) }) status!: SellerStatus;
  @ApiProperty() businessName!: string;
}

export class AdminUserCountsDto {
  @ApiProperty() orders!: number;
  @ApiProperty() addresses!: number;
  @ApiProperty() reviews!: number;
  @ApiProperty() complaints!: number;
}

export class AdminUserDetailDto extends AdminUserListItemDto {
  @ApiProperty({ type: AdminUserCountsDto, description: "Related entity counts" })
  _count!: AdminUserCountsDto;
  @ApiProperty({ type: AdminSellerProfileRefDto, nullable: true })
  sellerProfile!: AdminSellerProfileRefDto | null;
}

export class AdminUserStatusDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: Object.values(UserStatus) }) status!: UserStatus;
}

/* ── Admin: categories ─────────────────────────────────────────── */

export class AdminCategoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) parentId!: string | null;
  @ApiProperty({ nullable: true, type: String }) imageUrl!: string | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
  @ApiProperty({ description: "Live product count under this category" }) productCount!: number;
  @ApiProperty({ description: "Immediate sub-category count" }) childCount!: number;
}

/* ── Admin: sellers ────────────────────────────────────────────── */

export class AdminUserRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ enum: Object.values(UserStatus) }) status!: UserStatus;
}

export class AdminShopRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: Object.values(ShopStatus) }) status!: ShopStatus;
}

export class AdminSellerDocumentDto {
  @ApiProperty() id!: string;
  @ApiProperty() sellerProfileId!: string;
  @ApiProperty({ enum: Object.values(SellerDocumentType) }) type!: SellerDocumentType;
  @ApiProperty() fileKey!: string;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class AdminSellerPayoutAccountDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: Object.values(PayoutMethod) }) method!: PayoutMethod;
  @ApiProperty() accountName!: string;
  @ApiProperty() accountMasked!: string;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class AdminSellerListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: Object.values(SellerType) }) sellerType!: SellerType;
  @ApiProperty() businessName!: string;
  @ApiProperty() contactPhone!: string;
  @ApiProperty({ nullable: true, type: String }) tradeLicenseNo!: string | null;
  @ApiProperty() businessAddress!: string;
  @ApiProperty({ enum: Object.values(SellerStatus) }) status!: SellerStatus;
  @ApiProperty({ nullable: true, type: String }) rejectionReason!: string | null;
  @ApiProperty({ description: "Times customers reported a delivered order as not delivered" })
  falseDeliveryFlags!: number;
  @ApiProperty({ description: "Open (non-terminal) shop orders across the seller's shops" })
  openOrderCount!: number;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) submittedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  verifiedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: AdminUserRefDto }) user!: AdminUserRefDto;
  @ApiProperty({ type: [AdminShopRefDto] }) shops!: AdminShopRefDto[];
}

export class AdminSellerDetailDto extends AdminSellerListItemDto {
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  reviewedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) reviewedById!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
  @ApiProperty({ type: [AdminSellerDocumentDto] })
  declare documents: AdminSellerDocumentDto[];
  @ApiProperty({ type: [AdminShopRefDto] }) declare shops: AdminShopRefDto[];
  @ApiProperty({ type: [AdminSellerPayoutAccountDto] })
  payoutAccounts!: AdminSellerPayoutAccountDto[];
}

export class SuspendedSellerOpenOrdersDto {
  @ApiProperty() sellerProfileId!: string;
  @ApiProperty() businessName!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() email!: string;
  @ApiProperty() falseDeliveryFlags!: number;
  @ApiProperty() openOrderCount!: number;
  @ApiProperty({ type: [Object] }) orders!: Record<string, unknown>[];
}

export class BulkCancelResultDto {
  @ApiProperty() sellerProfileId!: string;
  @ApiProperty() cancelledCount!: number;
  @ApiProperty() skipped!: number;
  @ApiProperty() openOrderCount!: number;
}

/* ── Admin: shops ──────────────────────────────────────────────── */

export class AdminSellerLiteRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() businessName!: string;
  @ApiProperty({ enum: Object.values(SellerStatus) }) status!: SellerStatus;
}

export class AdminShopListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ nullable: true, type: String }) logoUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) bannerUrl!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) district!: string | null;
  @ApiProperty({ nullable: true, type: String }) address!: string | null;
  @ApiProperty({ enum: Object.values(ShopStatus) }) status!: ShopStatus;
  @ApiProperty() isOnVacation!: boolean;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  suspendedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) suspensionReason!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: AdminSellerLiteRefDto }) sellerProfile!: AdminSellerLiteRefDto;
}

export class AdminShopSuspendDto {
  @ApiProperty() suspended!: boolean;
}

export class AdminShopReactivateDto {
  @ApiProperty() reactivated!: boolean;
}

/* ── Admin: products ───────────────────────────────────────────── */

export class AdminProductCategoryRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class AdminProductListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ type: String, description: "Order status as string" }) status!: string;
  @ApiProperty({ nullable: true, type: String }) rejectionReason!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  publishedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({
    type: Object,
    example: { id: "shop-1", name: "Green Valley", sellerProfile: { userId: "user-1" } },
  })
  shop!: { id: string; name: string; sellerProfile: { userId: string } };
  @ApiProperty({ type: AdminProductCategoryRefDto }) category!: AdminProductCategoryRefDto;
}

export class AdminProductStatusDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, description: "Product status after moderation" }) status!: string;
}

/* ── Admin: audit ──────────────────────────────────────────────── */

export class AuditLogDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) actorId!: string | null;
  @ApiProperty({ nullable: true, enum: Object.values(Role) }) actorRole!: Role | null;
  @ApiProperty({ example: "seller.approve" }) action!: string;
  @ApiProperty({ example: "SellerProfile" }) entityType!: string;
  @ApiProperty({ nullable: true, type: String }) entityId!: string | null;
  @ApiProperty({ nullable: true, type: Object }) before!: unknown;
  @ApiProperty({ nullable: true, type: Object }) after!: unknown;
  @ApiProperty({ nullable: true, type: String }) ipAddress!: string | null;
  @ApiProperty({ nullable: true, type: String }) userAgent!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}
