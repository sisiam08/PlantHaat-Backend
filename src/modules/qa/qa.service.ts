import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import {
  createdAtKeyset,
  decodeCreatedAtCursor,
  encodeCreatedAtCursor,
  InvalidCreatedAtCursorError,
} from "../../common/utils/created-at-cursor";
import type { Prisma } from "../../generated/prisma/client";
import type { ContentReportTargetType } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { recomputeReviewRatings } from "../reviews/review-ratings";
import type {
  QueryContentReportsDto,
  QuerySellerQuestionsDto,
  CursorQueryDto,
} from "./dto/qa.dto";

const QUESTION_RATE_PER_HOUR = 5;
const ANSWER_REPLY_RATE_PER_HOUR = 20;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const QUESTION_DELETE_AFTER_ANSWER_MS = 15 * 60 * 1000;

const AUTHOR_SELECT = { id: true, name: true, avatarUrl: true, deletedAt: true } as const;

interface AuthorRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  deletedAt: Date | null;
}

function mapAuthor(user: AuthorRow | null | undefined) {
  if (!user || user.deletedAt) {
    return { id: user?.id ?? null, name: null, avatarUrl: null, deleted: true };
  }
  return { id: user.id, name: user.name, avatarUrl: user.avatarUrl, deleted: false };
}

function cursorPage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
  total: number,
) {
  const last = rows.at(-1);
  const hasMore = rows.length === limit && Boolean(last);
  return {
    data: rows,
    meta: {
      limit,
      hasMore,
      total,
      nextCursor: hasMore && last ? encodeCreatedAtCursor(last.id, last.createdAt) : null,
    },
  };
}

@Injectable()
export class QaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ── Public reads ────────────────────────────────────────────────

  async listProductQuestions(slug: string, query: CursorQueryDto) {
    const product = await this.visibleProductBySlug(slug);
    if (!product) {
      return cursorPage([], query.limit ?? 20, 0);
    }
    return this.listQuestions({ productId: product.id }, query);
  }

  async listAnswers(questionId: string, query: CursorQueryDto) {
    const question = await this.prisma.productQuestion.findFirst({
      where: { id: questionId, status: "VISIBLE", product: this.visibleProductWhere() },
      select: { id: true },
    });
    if (!question) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Question not found");
    }
    return this.listAnswersForQuestion(questionId, query);
  }

  async listAnswerReplies(answerId: string, query: CursorQueryDto) {
    const answer = await this.prisma.questionAnswer.findFirst({
      where: {
        id: answerId,
        status: "VISIBLE",
        question: { status: "VISIBLE", product: this.visibleProductWhere() },
      },
      select: { id: true },
    });
    if (!answer) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Answer not found");
    }
    const limit = query.limit ?? 20;
    const keyset = this.decodeKeyset(query.cursor);
    const where: Prisma.ReplyWhereInput = {
      answerId,
      status: "VISIBLE",
      ...keyset,
    };
    const [rows, total] = await Promise.all([
      this.prisma.reply.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        include: { author: { select: AUTHOR_SELECT } },
      }),
      this.prisma.reply.count({ where: { answerId, status: "VISIBLE" } }),
    ]);
    return {
      data: rows.map((row) => this.toReply(row)),
      meta: this.metaFor(rows, limit, total),
    };
  }

  async listReviewReplies(reviewId: string, query: CursorQueryDto) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, status: "VISIBLE" },
      select: { id: true },
    });
    if (!review) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Review not found");
    }
    const limit = query.limit ?? 20;
    const keyset = this.decodeKeyset(query.cursor);
    const where: Prisma.ReplyWhereInput = {
      reviewId,
      status: "VISIBLE",
      ...keyset,
    };
    const [rows, total] = await Promise.all([
      this.prisma.reply.findMany({
        where,
        orderBy: [{ isSellerReply: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: limit,
        include: { author: { select: AUTHOR_SELECT } },
      }),
      this.prisma.reply.count({ where: { reviewId, status: "VISIBLE" } }),
    ]);
    return {
      data: rows.map((row) => this.toReply(row)),
      meta: this.metaFor(rows, limit, total),
    };
  }

  // ── Questions ───────────────────────────────────────────────────

  async askQuestion(userId: string, productId: string, body: string) {
    await this.requireVerified(userId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        slug: true,
        shop: { select: { sellerProfile: { select: { userId: true } } } },
      },
    });
    if (!product) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Product not found");
    }
    if (product.shop.sellerProfile.userId === userId) {
      throw AppException.forbidden(
        ErrorCode.FORBIDDEN,
        "You cannot ask a question about your own product",
      );
    }
    await this.rateLimitQuestions(userId);

    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const duplicate = await this.prisma.productQuestion.findFirst({
      where: { productId, authorId: userId, body, createdAt: { gte: since } },
      select: { id: true },
    });
    if (duplicate) {
      throw AppException.conflict(
        ErrorCode.CONFLICT,
        "You already asked this question recently",
      );
    }

    const question = await this.prisma.productQuestion.create({
      data: { productId, authorId: userId, body },
      include: { author: { select: AUTHOR_SELECT } },
    });
    await this.notify(product.shop.sellerProfile.userId, "QUESTION_ASKED", {
      title: "New product question",
      body: `A customer asked about "${product.name}".`,
      data: { questionId: question.id, productId },
    });
    return this.toQuestion(question, 0, []);
  }

  async updateQuestion(userId: string, id: string, body: string) {
    const question = await this.prisma.productQuestion.findFirst({
      where: { id, authorId: userId },
      select: { id: true },
    });
    if (!question) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Question not found");
    }
    const updated = await this.prisma.productQuestion.update({
      where: { id },
      data: { body },
      include: { author: { select: AUTHOR_SELECT } },
    });
    return this.toQuestion(updated, await this.answerCount(id), []);
  }

  async deleteQuestion(userId: string, id: string): Promise<void> {
    const question = await this.prisma.productQuestion.findFirst({
      where: { id, authorId: userId },
      select: { id: true, createdAt: true, _count: { select: { answers: true } } },
    });
    if (!question) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Question not found");
    }
    // Once answered, the author has 15 minutes to remove it; afterwards only an
    // admin hide is possible (keeps answer threads from vanishing).
    if (
      question._count.answers > 0 &&
      Date.now() > question.createdAt.getTime() + QUESTION_DELETE_AFTER_ANSWER_MS
    ) {
      throw AppException.badRequest(
        ErrorCode.FORBIDDEN,
        "An answered question can only be removed within 15 minutes",
      );
    }
    await this.prisma.productQuestion.delete({ where: { id } });
  }

  // ── Answers ─────────────────────────────────────────────────────

  async answerQuestion(userId: string, questionId: string, body: string) {
    await this.requireVerified(userId);
    const question = await this.prisma.productQuestion.findFirst({
      where: { id: questionId, status: "VISIBLE", product: this.visibleProductWhere() },
      select: {
        id: true,
        authorId: true,
        product: {
          select: {
            name: true,
            shop: { select: { sellerProfile: { select: { userId: true } } } },
          },
        },
      },
    });
    if (!question) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Question not found");
    }
    await this.rateLimitAnswersReplies(userId);
    const isSellerAnswer = question.product.shop.sellerProfile.userId === userId;
    const answer = await this.prisma.questionAnswer.create({
      data: { questionId, authorId: userId, body, isSellerAnswer },
      include: { author: { select: AUTHOR_SELECT } },
    });
    if (question.authorId !== userId) {
      await this.notify(question.authorId, "QUESTION_ANSWERED", {
        title: "Your question was answered",
        body: `Someone answered your question about "${question.product.name}".`,
        data: { questionId, answerId: answer.id },
      });
    }
    return this.toAnswer(answer, 0, []);
  }

  async updateAnswer(userId: string, id: string, body: string) {
    const answer = await this.prisma.questionAnswer.findFirst({
      where: { id, authorId: userId },
      select: { id: true },
    });
    if (!answer) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Answer not found");
    }
    const updated = await this.prisma.questionAnswer.update({
      where: { id },
      data: { body },
      include: { author: { select: AUTHOR_SELECT } },
    });
    const count = await this.prisma.reply.count({ where: { answerId: id, status: "VISIBLE" } });
    return this.toAnswer(updated, count, []);
  }

  async deleteAnswer(userId: string, id: string): Promise<void> {
    const answer = await this.prisma.questionAnswer.findFirst({
      where: { id, authorId: userId },
      select: { id: true },
    });
    if (!answer) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Answer not found");
    }
    await this.prisma.questionAnswer.delete({ where: { id } });
  }

  // ── Replies ─────────────────────────────────────────────────────

  async replyToAnswer(userId: string, answerId: string, body: string) {
    await this.requireVerified(userId);
    const answer = await this.prisma.questionAnswer.findFirst({
      where: {
        id: answerId,
        status: "VISIBLE",
        question: { status: "VISIBLE", product: this.visibleProductWhere() },
      },
      select: {
        id: true,
        authorId: true,
        question: {
          select: {
            product: { select: { shop: { select: { sellerProfile: { select: { userId: true } } } } } },
          },
        },
      },
    });
    if (!answer) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Answer not found");
    }
    await this.rateLimitAnswersReplies(userId);
    const isSellerReply = answer.question.product.shop.sellerProfile.userId === userId;
    const reply = await this.prisma.reply.create({
      data: { answerId, authorId: userId, body, isSellerReply },
      include: { author: { select: AUTHOR_SELECT } },
    });
    if (answer.authorId !== userId) {
      await this.notify(answer.authorId, "REPLY_RECEIVED", {
        title: "New reply",
        body: "Someone replied to your answer.",
        data: { answerId, replyId: reply.id },
      });
    }
    return this.toReply(reply);
  }

  async replyToReview(userId: string, reviewId: string, body: string) {
    await this.requireVerified(userId);
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, status: "VISIBLE" },
      select: {
        id: true,
        customerId: true,
        shop: { select: { sellerProfile: { select: { userId: true } } } },
      },
    });
    if (!review) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Review not found");
    }
    await this.rateLimitAnswersReplies(userId);
    const isSellerReply = review.shop.sellerProfile.userId === userId;
    const reply = await this.prisma.reply.create({
      data: { reviewId, authorId: userId, body, isSellerReply },
      include: { author: { select: AUTHOR_SELECT } },
    });
    if (review.customerId !== userId) {
      await this.notify(review.customerId, "REPLY_RECEIVED", {
        title: "New reply to your review",
        body: "Someone replied to your review.",
        data: { reviewId, replyId: reply.id },
      });
    }
    return this.toReply(reply);
  }

  async updateReply(userId: string, id: string, body: string) {
    const reply = await this.prisma.reply.findFirst({
      where: { id, authorId: userId },
      select: { id: true },
    });
    if (!reply) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Reply not found");
    }
    const updated = await this.prisma.reply.update({
      where: { id },
      data: { body },
      include: { author: { select: AUTHOR_SELECT } },
    });
    return this.toReply(updated);
  }

  async deleteReply(userId: string, id: string): Promise<void> {
    const reply = await this.prisma.reply.findFirst({
      where: { id, authorId: userId },
      select: { id: true },
    });
    if (!reply) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Reply not found");
    }
    await this.prisma.reply.delete({ where: { id } });
  }

  // ── Reports ─────────────────────────────────────────────────────

  async reportContent(
    userId: string,
    targetType: ContentReportTargetType,
    targetId: string,
    reason: string,
  ) {
    await this.requireVerified(userId);
    await this.assertTargetExists(targetType, targetId);
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const duplicate = await this.prisma.contentReport.findFirst({
      where: { targetType, targetId, reporterId: userId, createdAt: { gte: since } },
      select: { id: true },
    });
    if (duplicate) {
      throw AppException.conflict(ErrorCode.CONFLICT, "You already reported this content");
    }
    return this.prisma.contentReport.create({
      data: { targetType, targetId, reporterId: userId, reason },
    });
  }

  // ── Seller ──────────────────────────────────────────────────────

  async listSellerQuestions(sellerUserId: string, query: QuerySellerQuestionsDto) {
    const limit = query.limit ?? 20;
    const keyset = this.decodeKeyset(query.cursor);
    const where: Prisma.ProductQuestionWhereInput = {
      product: { shop: { sellerProfile: { userId: sellerUserId } } },
      status: "VISIBLE",
      ...(query.status === "unanswered" ? { answers: { none: { status: "VISIBLE" } } } : {}),
      ...keyset,
    };
    const [rows, total] = await Promise.all([
      this.prisma.productQuestion.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        include: {
          author: { select: AUTHOR_SELECT },
          product: { select: { id: true, name: true, slug: true } },
          _count: { select: { answers: true } },
        },
      }),
      this.prisma.productQuestion.count({
        where: {
          product: { shop: { sellerProfile: { userId: sellerUserId } } },
          status: "VISIBLE",
        },
      }),
    ]);
    return {
      data: rows.map((row) => ({
        ...this.toQuestion(row, row._count.answers, []),
        product: row.product,
      })),
      meta: this.metaFor(rows, limit, total),
    };
  }

  async unansweredCount(sellerUserId: string): Promise<number> {
    return this.prisma.productQuestion.count({
      where: {
        product: { shop: { sellerProfile: { userId: sellerUserId } } },
        status: "VISIBLE",
        answers: { none: { status: "VISIBLE" } },
      },
    });
  }

  // ── Admin ───────────────────────────────────────────────────────

  async listContentReports(query: QueryContentReportsDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.ContentReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contentReport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.contentReport.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async resolveReport(id: string, hide: boolean, actor: AuthenticatedUser) {
    const report = await this.prisma.contentReport.findUnique({ where: { id } });
    if (!report) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Report not found");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.contentReport.update({
        where: { id },
        data: {
          status: hide ? "RESOLVED_HIDDEN" : "RESOLVED_KEPT",
          resolvedById: actor.id,
          resolvedAt: new Date(),
        },
      });
      if (hide) {
        await this.hideTarget(tx, report.targetType, report.targetId);
      }
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: hide ? "content.hide" : "content.keep",
      entityType: report.targetType,
      entityId: report.targetId,
    });
    return { resolved: true, hidden: hide };
  }

  async setVisibility(
    kind: "questions" | "answers" | "replies",
    id: string,
    visible: boolean,
    actor: AuthenticatedUser,
  ) {
    const status = visible ? "VISIBLE" : "HIDDEN";
    const missing = () => AppException.notFound(ErrorCode.NOT_FOUND, "Content not found");
    if (kind === "questions") {
      const row = await this.prisma.productQuestion.findUnique({ where: { id }, select: { id: true } });
      if (!row) throw missing();
      await this.prisma.productQuestion.update({ where: { id }, data: { status } });
    } else if (kind === "answers") {
      const row = await this.prisma.questionAnswer.findUnique({ where: { id }, select: { id: true } });
      if (!row) throw missing();
      await this.prisma.questionAnswer.update({ where: { id }, data: { status } });
    } else {
      const row = await this.prisma.reply.findUnique({ where: { id }, select: { id: true } });
      if (!row) throw missing();
      await this.prisma.reply.update({ where: { id }, data: { status } });
    }
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: visible ? `${kind}.unhide` : `${kind}.hide`,
      entityType: kind,
      entityId: id,
    });
    return { id, status: visible ? "VISIBLE" : "HIDDEN" };
  }

  // ── Internals ───────────────────────────────────────────────────

  private async listQuestions(where: Prisma.ProductQuestionWhereInput, query: CursorQueryDto) {
    const limit = query.limit ?? 20;
    const keyset = this.decodeKeyset(query.cursor);
    const combined: Prisma.ProductQuestionWhereInput = {
      ...where,
      status: "VISIBLE",
      ...keyset,
    };
    const [rows, total] = await Promise.all([
      this.prisma.productQuestion.findMany({
        where: combined,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit,
        include: {
          author: { select: AUTHOR_SELECT },
          _count: { select: { answers: { where: { status: "VISIBLE" } } } },
          answers: {
            where: { status: "VISIBLE" },
            orderBy: [{ isSellerAnswer: "desc" }, { createdAt: "asc" }],
            take: 2,
            include: {
              author: { select: AUTHOR_SELECT },
              replies: {
                where: { status: "VISIBLE" },
                orderBy: [{ createdAt: "asc" }],
                take: 2,
                include: { author: { select: AUTHOR_SELECT } },
              },
              _count: { select: { replies: { where: { status: "VISIBLE" } } } },
            },
          },
        },
      }),
      this.prisma.productQuestion.count({ where: { ...where, status: "VISIBLE" } }),
    ]);
    return {
      data: rows.map((row) =>
        this.toQuestion(
          row,
          row._count.answers,
          row.answers.map((answer) =>
            this.toAnswer(
              answer,
              answer._count.replies,
              answer.replies.map((reply) => this.toReply(reply)),
            ),
          ),
        ),
      ),
      meta: this.metaFor(rows, limit, total),
    };
  }

  private async listAnswersForQuestion(questionId: string, query: CursorQueryDto) {
    const limit = query.limit ?? 20;
    const keyset = this.decodeKeyset(query.cursor);
    const where: Prisma.QuestionAnswerWhereInput = {
      questionId,
      status: "VISIBLE",
      ...keyset,
    };
    const [rows, total] = await Promise.all([
      this.prisma.questionAnswer.findMany({
        where,
        orderBy: [{ isSellerAnswer: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: limit,
        include: {
          author: { select: AUTHOR_SELECT },
          replies: {
            where: { status: "VISIBLE" },
            orderBy: [{ createdAt: "asc" }],
            take: 2,
            include: { author: { select: AUTHOR_SELECT } },
          },
          _count: { select: { replies: { where: { status: "VISIBLE" } } } },
        },
      }),
      this.prisma.questionAnswer.count({ where: { questionId, status: "VISIBLE" } }),
    ]);
    return {
      data: rows.map((row) =>
        this.toAnswer(
          row,
          row._count.replies,
          row.replies.map((reply) => this.toReply(reply)),
        ),
      ),
      meta: this.metaFor(rows, limit, total),
    };
  }

  private async assertTargetExists(targetType: ContentReportTargetType, targetId: string) {
    const found =
      targetType === "QUESTION"
        ? await this.prisma.productQuestion.findUnique({ where: { id: targetId }, select: { id: true } })
        : targetType === "ANSWER"
          ? await this.prisma.questionAnswer.findUnique({ where: { id: targetId }, select: { id: true } })
          : targetType === "REPLY"
            ? await this.prisma.reply.findUnique({ where: { id: targetId }, select: { id: true } })
            : await this.prisma.review.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!found) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Content not found");
    }
  }

  private async hideTarget(
    tx: Prisma.TransactionClient,
    targetType: ContentReportTargetType,
    targetId: string,
  ): Promise<void> {
    if (targetType === "QUESTION") {
      await tx.productQuestion.update({ where: { id: targetId }, data: { status: "HIDDEN" } });
    } else if (targetType === "ANSWER") {
      await tx.questionAnswer.update({ where: { id: targetId }, data: { status: "HIDDEN" } });
    } else if (targetType === "REPLY") {
      await tx.reply.update({ where: { id: targetId }, data: { status: "HIDDEN" } });
    } else {
      const review = await tx.review.update({
        where: { id: targetId },
        data: { status: "HIDDEN" },
        select: { productId: true, shopId: true },
      });
      await recomputeReviewRatings(tx, review.productId, review.shopId);
    }
  }

  private async requireVerified(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true, status: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.status !== "ACTIVE") {
      throw AppException.forbidden(ErrorCode.FORBIDDEN, "Account is not active");
    }
    if (!user.emailVerifiedAt) {
      throw AppException.forbidden(ErrorCode.EMAIL_NOT_VERIFIED, "Verify your email to post");
    }
  }

  private async rateLimitQuestions(userId: string): Promise<void> {
    const count = await this.prisma.productQuestion.count({
      where: { authorId: userId, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    });
    if (count >= QUESTION_RATE_PER_HOUR) {
      throw AppException.unprocessable(
        ErrorCode.TOO_MANY_REQUESTS,
        "You can ask at most 5 questions per hour",
      );
    }
  }

  private async rateLimitAnswersReplies(userId: string): Promise<void> {
    const since = new Date(Date.now() - 3_600_000);
    const [answers, replies] = await Promise.all([
      this.prisma.questionAnswer.count({ where: { authorId: userId, createdAt: { gte: since } } }),
      this.prisma.reply.count({ where: { authorId: userId, createdAt: { gte: since } } }),
    ]);
    if (answers + replies >= ANSWER_REPLY_RATE_PER_HOUR) {
      throw AppException.unprocessable(
        ErrorCode.TOO_MANY_REQUESTS,
        "You can post at most 20 answers/replies per hour",
      );
    }
  }

  private async notify(
    userId: string,
    type: "QUESTION_ASKED" | "QUESTION_ANSWERED" | "REPLY_RECEIVED",
    input: { title: string; body: string; data: Record<string, unknown> },
  ): Promise<void> {
    await this.notifications.create({
      userId,
      type,
      title: input.title,
      body: input.body,
      data: input.data,
    });
  }

  private decodeKeyset(cursor: string | undefined): Record<string, unknown> {
    if (!cursor) {
      return {};
    }
    try {
      return createdAtKeyset(decodeCreatedAtCursor(cursor));
    } catch (error) {
      if (error instanceof InvalidCreatedAtCursorError) {
        throw AppException.badRequest(ErrorCode.INVALID_CURSOR, "Invalid cursor");
      }
      throw error;
    }
  }

  private metaFor(rows: { id: string; createdAt: Date }[], limit: number, total: number) {
    const last = rows.at(-1);
    const hasMore = rows.length === limit && Boolean(last);
    return {
      limit,
      hasMore,
      total,
      nextCursor: hasMore && last ? encodeCreatedAtCursor(last.id, last.createdAt) : null,
    };
  }

  private visibleProductWhere(): Prisma.ProductWhereInput {
    return { status: "ACTIVE", deletedAt: null };
  }

  private visibleProductBySlug(slug: string) {
    return this.prisma.product.findFirst({
      where: { slug, ...this.visibleProductWhere() },
      select: { id: true },
    });
  }

  private async answerCount(questionId: string): Promise<number> {
    return this.prisma.questionAnswer.count({ where: { questionId, status: "VISIBLE" } });
  }

  private toQuestion(
    row: { id: string; productId: string; body: string; status: string; createdAt: Date; updatedAt: Date; author: AuthorRow },
    answerCount: number,
    answers: unknown[],
  ) {
    return {
      id: row.id,
      productId: row.productId,
      body: row.body,
      status: row.status,
      author: mapAuthor(row.author),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      answerCount,
      answers,
    };
  }

  private toAnswer(
    row: {
      id: string;
      questionId: string;
      body: string;
      isSellerAnswer: boolean;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      author: AuthorRow;
    },
    replyCount: number,
    replies: unknown[],
  ) {
    return {
      id: row.id,
      questionId: row.questionId,
      body: row.body,
      isSellerAnswer: row.isSellerAnswer,
      status: row.status,
      author: mapAuthor(row.author),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      replyCount,
      replies,
    };
  }

  private toReply(row: {
    id: string;
    answerId: string | null;
    reviewId: string | null;
    body: string;
    isSellerReply: boolean;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    author: AuthorRow;
  }) {
    return {
      id: row.id,
      answerId: row.answerId,
      reviewId: row.reviewId,
      body: row.body,
      isSellerReply: row.isSellerReply,
      status: row.status,
      author: mapAuthor(row.author),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
