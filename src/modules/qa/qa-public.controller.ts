import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import {
  ApiCursorPaginatedResponse,
  ApiEnvelopeResponse,
} from "../../common/swagger/api-response.decorators";
import {
  CreateBodyDto,
  CreateQuestionDto,
  CursorQueryDto,
  ReportContentDto,
  UpdateBodyDto,
  UpdateQuestionDto,
} from "./dto/qa.dto";
import {
  AnswerDto,
  ContentReportDto,
  QuestionDto,
  ReplyDto,
} from "./dto/qa-response.dto";
import { QaService } from "./qa.service";

const ANSWER_THROTTLE = { default: { limit: 20, ttl: 60 * 60 * 1000 } };

@ApiTags("Q&A")
@Controller()
export class QaPublicController {
  constructor(private readonly qa: QaService) {}

  @Public()
  @Get("products/:slug/questions")
  @ApiOperation({ summary: "List visible questions for a product (newest first)" })
  @ApiCursorPaginatedResponse(QuestionDto)
  listQuestions(@Param("slug") slug: string, @Query() query: CursorQueryDto) {
    return this.qa.listProductQuestions(slug, query);
  }

  @Public()
  @Get("questions/:id/answers")
  @ApiOperation({ summary: "List answers for a question (seller answers first)" })
  @ApiCursorPaginatedResponse(AnswerDto)
  listAnswers(@Param("id") id: string, @Query() query: CursorQueryDto) {
    return this.qa.listAnswers(id, query);
  }

  @Public()
  @Get("answers/:id/replies")
  @ApiOperation({ summary: "List replies under an answer" })
  @ApiCursorPaginatedResponse(ReplyDto)
  listAnswerReplies(@Param("id") id: string, @Query() query: CursorQueryDto) {
    return this.qa.listAnswerReplies(id, query);
  }

  @Public()
  @Get("reviews/:id/replies")
  @ApiOperation({ summary: "List replies under a review" })
  @ApiCursorPaginatedResponse(ReplyDto)
  listReviewReplies(@Param("id") id: string, @Query() query: CursorQueryDto) {
    return this.qa.listReviewReplies(id, query);
  }

  @Post("products/:id/questions")
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @ApiOperation({ summary: "Ask a question (verified users only)" })
  @ApiEnvelopeResponse(QuestionDto, { status: 201 })
  ask(
    @CurrentUser("id") userId: string,
    @Param("id") productId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.qa.askQuestion(userId, productId, dto.body);
  }

  @Patch("questions/:id")
  @ApiOperation({ summary: "Edit your question" })
  @ApiEnvelopeResponse(QuestionDto)
  updateQuestion(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.qa.updateQuestion(userId, id, dto.body);
  }

  @Delete("questions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete your question (15 min window once answered)" })
  @ApiNoContentResponse({ description: "Question deleted" })
  async deleteQuestion(@CurrentUser("id") userId: string, @Param("id") id: string) {
    await this.qa.deleteQuestion(userId, id);
  }

  @Post("questions/:id/answers")
  @Throttle(ANSWER_THROTTLE)
  @ApiOperation({ summary: "Answer a question (verified users only)" })
  @ApiEnvelopeResponse(AnswerDto, { status: 201 })
  answer(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: CreateBodyDto,
  ) {
    return this.qa.answerQuestion(userId, id, dto.body);
  }

  @Patch("answers/:id")
  @ApiOperation({ summary: "Edit your answer" })
  @ApiEnvelopeResponse(AnswerDto)
  updateAnswer(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateBodyDto,
  ) {
    return this.qa.updateAnswer(userId, id, dto.body);
  }

  @Delete("answers/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete your answer" })
  @ApiNoContentResponse({ description: "Answer deleted" })
  async deleteAnswer(@CurrentUser("id") userId: string, @Param("id") id: string) {
    await this.qa.deleteAnswer(userId, id);
  }

  @Post("answers/:id/replies")
  @Throttle(ANSWER_THROTTLE)
  @ApiOperation({ summary: "Reply to an answer (verified users only)" })
  @ApiEnvelopeResponse(ReplyDto, { status: 201 })
  replyToAnswer(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: CreateBodyDto,
  ) {
    return this.qa.replyToAnswer(userId, id, dto.body);
  }

  @Post("reviews/:id/replies")
  @Throttle(ANSWER_THROTTLE)
  @ApiOperation({ summary: "Reply to a review (verified users only)" })
  @ApiEnvelopeResponse(ReplyDto, { status: 201 })
  replyToReview(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: CreateBodyDto,
  ) {
    return this.qa.replyToReview(userId, id, dto.body);
  }

  @Patch("replies/:id")
  @ApiOperation({ summary: "Edit your reply" })
  @ApiEnvelopeResponse(ReplyDto)
  updateReply(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateBodyDto,
  ) {
    return this.qa.updateReply(userId, id, dto.body);
  }

  @Delete("replies/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete your reply" })
  @ApiNoContentResponse({ description: "Reply deleted" })
  async deleteReply(@CurrentUser("id") userId: string, @Param("id") id: string) {
    await this.qa.deleteReply(userId, id);
  }

  @Post("questions/:id/report")
  @ApiOperation({ summary: "Report a question" })
  @ApiEnvelopeResponse(ContentReportDto, { status: 201 })
  reportQuestion(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: ReportContentDto,
  ) {
    return this.qa.reportContent(userId, "QUESTION", id, dto.reason);
  }

  @Post("answers/:id/report")
  @ApiOperation({ summary: "Report an answer" })
  @ApiEnvelopeResponse(ContentReportDto, { status: 201 })
  reportAnswer(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: ReportContentDto,
  ) {
    return this.qa.reportContent(userId, "ANSWER", id, dto.reason);
  }

  @Post("replies/:id/report")
  @ApiOperation({ summary: "Report a reply" })
  @ApiEnvelopeResponse(ContentReportDto, { status: 201 })
  reportReply(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: ReportContentDto,
  ) {
    return this.qa.reportContent(userId, "REPLY", id, dto.reason);
  }

  @Post("reviews/:id/report")
  @ApiOperation({ summary: "Report a review" })
  @ApiEnvelopeResponse(ContentReportDto, { status: 201 })
  reportReview(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: ReportContentDto,
  ) {
    return this.qa.reportContent(userId, "REVIEW", id, dto.reason);
  }
}
