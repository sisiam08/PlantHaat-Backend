import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import {
  ContentReportTargetType,
  ContentStatus,
} from "../../../generated/prisma/enums";

export class QaAuthorDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  id!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  name!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  avatarUrl!: string | null;
  @ApiProperty({ description: "The author's account was deleted" })
  deleted!: boolean;
}

export class ReplyDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) answerId!: string | null;
  @ApiProperty({ nullable: true, type: String }) reviewId!: string | null;
  @ApiProperty() body!: string;
  @ApiProperty() isSellerReply!: boolean;
  @ApiProperty({ enum: Object.values(ContentStatus) }) status!: ContentStatus;
  @ApiProperty({ type: QaAuthorDto }) author!: QaAuthorDto;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
}

export class AnswerDto {
  @ApiProperty() id!: string;
  @ApiProperty() questionId!: string;
  @ApiProperty() body!: string;
  @ApiProperty() isSellerAnswer!: boolean;
  @ApiProperty({ enum: Object.values(ContentStatus) }) status!: ContentStatus;
  @ApiProperty({ type: QaAuthorDto }) author!: QaAuthorDto;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
  @ApiProperty() replyCount!: number;
  @ApiProperty({ type: [ReplyDto] }) replies!: ReplyDto[];
}

export class QuestionDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ enum: Object.values(ContentStatus) }) status!: ContentStatus;
  @ApiProperty({ type: QaAuthorDto }) author!: QaAuthorDto;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
  @ApiProperty() answerCount!: number;
  @ApiProperty({ type: [AnswerDto], description: "The first answers (seller first)" })
  answers!: AnswerDto[];
}

export class SellerQuestionProductRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class SellerQuestionDto extends QuestionDto {
  @ApiProperty({ type: SellerQuestionProductRefDto })
  product!: SellerQuestionProductRefDto;
}

export class CursorMetaDto {
  @ApiProperty() limit!: number;
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null;
  @ApiProperty() hasMore!: boolean;
}

export class QuestionCursorMetaDto extends CursorMetaDto {
  @ApiProperty() total!: number;
}

export class ReplyCursorMetaDto extends CursorMetaDto {
  @ApiProperty() total!: number;
}

export class AnswerCursorMetaDto extends CursorMetaDto {
  @ApiProperty() total!: number;
}

export class ContentReportDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: Object.values(ContentReportTargetType) })
  targetType!: ContentReportTargetType;
  @ApiProperty() targetId!: string;
  @ApiProperty() reporterId!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: ["OPEN", "RESOLVED_HIDDEN", "RESOLVED_KEPT"] })
  status!: string;
  @ApiProperty({ nullable: true, type: String }) resolvedById!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  resolvedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description: "Reported content in context (body/rating, author, product {id,name,slug})",
  })
  target?: Record<string, unknown> | null;
}

export class ContentReportResolveDto {
  @ApiProperty() resolved!: boolean;
  @ApiProperty({ description: "Whether the reported content was hidden" })
  hidden!: boolean;
}

export class ContentModerationResultDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: String }) status!: string;
}

export class SellerUnansweredCountDto {
  @ApiProperty() unanswered!: number;
}
