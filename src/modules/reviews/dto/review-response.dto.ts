import { ApiProperty } from "@nestjs/swagger";

import { ReportStatus, ReviewStatus } from "../../../generated/prisma/enums";

export class ReviewDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() shopId!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() orderItemId!: string;
  @ApiProperty() rating!: number;
  @ApiProperty({ nullable: true, type: String }) title!: string | null;
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
  @ApiProperty({ enum: Object.values(ReviewStatus) }) status!: ReviewStatus;
  @ApiProperty({ nullable: true, type: String }) sellerReply!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  sellerRepliedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
}

export class ReviewImageDto {
  @ApiProperty() id!: string;
  @ApiProperty() reviewId!: string;
  @ApiProperty() url!: string;
}

export class ReviewProductRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class SellerReviewListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() shopId!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() orderItemId!: string;
  @ApiProperty() rating!: number;
  @ApiProperty({ nullable: true, type: String }) title!: string | null;
  @ApiProperty({ nullable: true, type: String }) comment!: string | null;
  @ApiProperty({ enum: Object.values(ReviewStatus) }) status!: ReviewStatus;
  @ApiProperty({ nullable: true, type: String }) sellerReply!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  sellerRepliedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
  @ApiProperty({ type: [ReviewImageDto] }) images!: ReviewImageDto[];
  @ApiProperty({ type: ReviewProductRefDto }) product!: ReviewProductRefDto;
}

export class ReviewReportDto {
  @ApiProperty() id!: string;
  @ApiProperty() reviewId!: string;
  @ApiProperty() reporterId!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: Object.values(ReportStatus) }) status!: ReportStatus;
  @ApiProperty({ nullable: true, type: String }) resolvedById!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) resolvedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}
