import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { HomepageSectionType } from "../../../generated/prisma/enums";

export class BannerDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) title!: string | null;
  @ApiProperty() imageUrl!: string;
  @ApiProperty({ nullable: true, type: String }) linkUrl!: string | null;
  @ApiProperty({ example: "HOME_HERO" }) placement!: string;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) startsAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) endsAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) imagePublicId?: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) imageWidth?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) imageHeight?: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) mobileImageUrl?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) mobileImagePublicId?: string | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) mobileImageWidth?: number | null;
  @ApiPropertyOptional({ nullable: true, type: Number }) mobileImageHeight?: number | null;
  @ApiPropertyOptional({ nullable: true, type: String }) imageAltBn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) imageAltEn?: string | null;
  @ApiPropertyOptional({ type: Number }) focalX?: number;
  @ApiPropertyOptional({ type: Number }) focalY?: number;
  @ApiPropertyOptional({ type: Number }) mobileFocalX?: number;
  @ApiPropertyOptional({ type: Number }) mobileFocalY?: number;
  @ApiPropertyOptional({ type: Boolean }) overlayEnabled?: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) headlineBn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) headlineEn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) subtextBn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) subtextEn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) textColor?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) scrimColor?: string | null;
  @ApiPropertyOptional({ type: Number }) scrimOpacity?: number;
  @ApiPropertyOptional({ nullable: true, type: String }) desktopPosition?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) mobilePosition?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) desktopAlign?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) mobileAlign?: string | null;
  @ApiPropertyOptional({ type: Boolean }) buttonEnabled?: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) buttonLabelBn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) buttonLabelEn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) buttonHref?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) buttonStyle?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) buttonBgColor?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) buttonTextColor?: string | null;
  @ApiPropertyOptional({ type: Boolean }) openInNewTab?: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) createdById?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) updatedById?: string | null;
}

export class HomepageSectionDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) titleBn!: string | null;
  @ApiProperty({ enum: Object.values(HomepageSectionType) }) type!: HomepageSectionType;
  @ApiProperty({ type: [String] }) itemIds!: string[];
  @ApiProperty({ nullable: true, type: Object }) config!: Record<string, unknown> | null;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
}
