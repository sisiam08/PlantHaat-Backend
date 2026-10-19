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

export class ReviewAuthorRefDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) name!: string | null;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({ description: "The author's account was deleted" }) deleted!: boolean;
}

export class ProductReviewListItemDto extends ReviewDto {
  @ApiProperty({ type: [ReviewImageDto] }) images!: ReviewImageDto[];
  @ApiProperty({ type: ReviewAuthorRefDto }) customer!: ReviewAuthorRefDto;
  @ApiProperty() replyCount!: number;
  @ApiProperty({ type: [Object], description: "Threaded replies (seller first)" })
  replies!: Record<string, unknown>[];
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

export class AdminReviewReportDto extends ReviewReportDto {
  @ApiProperty({ type: ReviewDto, description: "The reported review" })
  review!: ReviewDto;
}

export class ReviewReportResolveDto {
  @ApiProperty({ example: true }) resolved!: boolean;
  @ApiProperty({ description: "Whether the reported review was hidden" }) hidden!: boolean;
}

export class ReviewModerationResultDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, description: "Review status after moderation" }) status!: string;
}
