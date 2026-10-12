import { ApiProperty } from "@nestjs/swagger";

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
