import { ApiProperty } from "@nestjs/swagger";

import { ComplaintStatus, ComplaintType, RefundStatus, Role } from "../../../generated/prisma/enums";

export class ComplaintAttachmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() complaintId!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class ComplaintShopRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class ComplaintCommentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() complaintId!: string;
  @ApiProperty() authorId!: string;
  @ApiProperty({ enum: Object.values(Role) }) authorRole!: Role;
  @ApiProperty() body!: string;
  @ApiProperty() isInternal!: boolean;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class SellerComplaintListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() ticketNumber!: string;
  @ApiProperty() shopOrderId!: string;
  @ApiProperty({ nullable: true, type: String }) orderItemId!: string | null;
  @ApiProperty() customerId!: string;
  @ApiProperty() shopId!: string;
  @ApiProperty({ enum: Object.values(ComplaintType) }) type!: ComplaintType;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: Object.values(ComplaintStatus) }) status!: ComplaintStatus;
  @ApiProperty({ nullable: true, type: String }) resolutionNote!: string | null;
  @ApiProperty({ nullable: true, type: String }) resolvedById!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) resolvedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
  @ApiProperty({ type: [ComplaintAttachmentDto] }) attachments!: ComplaintAttachmentDto[];
  @ApiProperty({ type: ComplaintShopRefDto }) shop!: ComplaintShopRefDto;
}

export class SellerComplaintDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() ticketNumber!: string;
  @ApiProperty() shopOrderId!: string;
  @ApiProperty({ nullable: true, type: String }) orderItemId!: string | null;
  @ApiProperty() customerId!: string;
  @ApiProperty() shopId!: string;
  @ApiProperty({ enum: Object.values(ComplaintType) }) type!: ComplaintType;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: Object.values(ComplaintStatus) }) status!: ComplaintStatus;
  @ApiProperty({ nullable: true, type: String }) resolutionNote!: string | null;
  @ApiProperty({ nullable: true, type: String }) resolvedById!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) resolvedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
  @ApiProperty({ type: [ComplaintAttachmentDto] }) attachments!: ComplaintAttachmentDto[];
  @ApiProperty({ type: [ComplaintCommentResponseDto] })
  comments!: ComplaintCommentResponseDto[];
}

export class AdminComplaintRefundRefDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) amount!: string;
  @ApiProperty({ enum: Object.values(RefundStatus) }) status!: RefundStatus;
}

export class AdminComplaintListItemDto extends SellerComplaintListItemDto {}

export class AdminComplaintDetailDto extends SellerComplaintDetailDto {
  @ApiProperty({ type: [AdminComplaintRefundRefDto] })
  refunds!: AdminComplaintRefundRefDto[];
  @ApiProperty({
    type: [ComplaintCommentResponseDto],
    description: "Includes internal admin comments",
  })
  declare comments: ComplaintCommentResponseDto[];
}

export class CustomerComplaintDetailDto extends SellerComplaintDetailDto {
  @ApiProperty({ type: [AdminComplaintRefundRefDto] })
  refunds!: AdminComplaintRefundRefDto[];
}
