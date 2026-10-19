import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { paginate } from "../../common/types/paginated";
import type { Prisma } from "../../generated/prisma/client";
import type { ReportStatus } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type {
  CreateReviewDto,
  QueryProductReviewsDto,
  QueryReviewsDto,
  ReplyReviewDto,
  ReportReviewDto,
  UpdateReviewDto,
} from "./dto/review.dto";
import { recomputeReviewRatings } from "./review-ratings";

const REVIEW_EDIT_WINDOW_DAYS = 7;

type ReviewSort = "newest" | "highest" | "lowest";

interface ReviewCursor {
  rating: number;
  createdAt: Date;
  id: string;
}

function encodeReviewCursor(sort: ReviewSort, row: { rating: number; createdAt: Date; id: string }) {
  return Buffer.from(
    JSON.stringify({ v: 1, s: sort, r: row.rating, t: row.createdAt.toISOString(), id: row.id }),
    "utf8",
  ).toString("base64url");
}

function decodeReviewCursor(cursor: string, sort: ReviewSort): ReviewCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw AppException.badRequest(ErrorCode.INVALID_CURSOR, "Invalid cursor");
  }
  const c = parsed as { v?: unknown; s?: unknown; r?: unknown; t?: unknown; id?: unknown };
  if (
    c.v !== 1 ||
    c.s !== sort ||
    typeof c.r !== "number" ||
    typeof c.t !== "string" ||
    typeof c.id !== "string" ||
    c.id.length === 0
  ) {
    throw AppException.badRequest(ErrorCode.INVALID_CURSOR, "Invalid cursor");
  }
  const createdAt = new Date(c.t);
  if (Number.isNaN(createdAt.getTime())) {
    throw AppException.badRequest(ErrorCode.INVALID_CURSOR, "Invalid cursor");
  }
  return { rating: c.r, createdAt, id: c.id };
}

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async create(customerId: string, orderItemId: string, dto: CreateReviewDto) {
    const orderItem = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: { shopOrder: true, review: { select: { id: true } } },
    });
    if (!orderItem || !orderItem.productId || !orderItem.variantId) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Order item not found");
    }
    const shopOrder = orderItem.shopOrder;
    const customer = await this.prisma.order.findUnique({
      where: { id: shopOrder.orderId },
      select: { customerId: true },
    });
    if (!customer || customer.customerId !== customerId) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Order item not found");
    }
    if (shopOrder.status !== "DELIVERED") {
      throw AppException.badRequest(
        ErrorCode.REVIEW_NOT_ALLOWED,
        "You can review only delivered items",
      );
    }
    const windowDays = await this.settings.getNumber("review.windowDays");
    const deliveredAt = shopOrder.deliveredAt;
    if (!deliveredAt || Date.now() > deliveredAt.getTime() + windowDays * 86_400_000) {
      throw AppException.badRequest(ErrorCode.REVIEW_WINDOW_CLOSED, "The review window has closed");
    }
    if (orderItem.review) {
      throw AppException.conflict(ErrorCode.REVIEW_ALREADY_EXISTS, "This item is already reviewed");
    }

    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          productId: orderItem.productId!,
          shopId: shopOrder.shopId,
          customerId,
          orderItemId,
          rating: dto.rating,
          title: dto.title ?? null,
          comment: dto.comment ?? null,
          images: dto.images?.length ? { create: dto.images.map((url) => ({ url })) } : undefined,
        },
      });
      await recomputeReviewRatings(tx, orderItem.productId!, shopOrder.shopId);
      return created;
    });
    return review;
  }

  async update(customerId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.getOwned(customerId, reviewId);
    if (Date.now() > review.createdAt.getTime() + REVIEW_EDIT_WINDOW_DAYS * 86_400_000) {
      throw AppException.badRequest(
        ErrorCode.REVIEW_WINDOW_CLOSED,
        "A review can only be edited within 7 days",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id: reviewId },
        data: {
          ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
        },
      });
      if (dto.images !== undefined) {
        await tx.reviewImage.deleteMany({ where: { reviewId } });
        if (dto.images.length > 0) {
          await tx.reviewImage.createMany({
            data: dto.images.map((url) => ({ reviewId, url })),
          });
        }
      }
      await recomputeReviewRatings(tx, review.productId, review.shopId);
    });
    return this.prisma.review.findUniqueOrThrow({ where: { id: reviewId } });
  }

  async remove(customerId: string, reviewId: string): Promise<void> {
    const review = await this.getOwned(customerId, reviewId);
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: reviewId } });
      await recomputeReviewRatings(tx, review.productId, review.shopId);
    });
  }

  async listForProduct(slug: string, query: QueryProductReviewsDto) {
    const product = await this.prisma.product.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Product not found");
    }
    const base: Prisma.ReviewWhereInput = { productId: product.id, status: "VISIBLE" };
    const filtered: Prisma.ReviewWhereInput = {
      ...base,
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.withPhotos ? { images: { some: {} } } : {}),
    };

    const [distributionRows, averageAgg] = await Promise.all([
      this.prisma.review.groupBy({
        by: ["rating"],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.review.aggregate({ where: base, _avg: { rating: true } }),
    ]);
    const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const row of distributionRows) {
      distribution[String(row.rating)] = row._count._all;
    }
    const average = Math.round((averageAgg._avg.rating ?? 0) * 100) / 100;

    const include = {
      images: true,
      customer: { select: { id: true, name: true, avatarUrl: true, deletedAt: true } },
      _count: { select: { replies: { where: { status: "VISIBLE" as const } } } },
    } satisfies Prisma.ReviewInclude;

    if (query.pagination === "cursor") {
      const sort = query.sort ?? "newest";
      const limit = query.limit ?? 20;
      const keyset = query.cursor ? reviewKeyset(sort, decodeReviewCursor(query.cursor, sort)) : {};
      const where: Prisma.ReviewWhereInput = { AND: [filtered, keyset] };
      const [rows, total] = await Promise.all([
        this.prisma.review.findMany({
          where,
          orderBy: reviewOrderBy(sort),
          take: limit,
          include,
        }),
        this.prisma.review.count({ where: filtered }),
      ]);
      const last = rows.at(-1);
      const hasMore = rows.length === limit && Boolean(last);
      return {
        data: rows.map(toReviewItem),
        meta: {
          limit,
          hasMore,
          total,
          average,
          distribution,
          nextCursor: hasMore && last ? encodeReviewCursor(sort, last) : null,
        },
      };
    }

    const { page, limit, skip } = resolvePagination(query);
    const sort = query.sort ?? "newest";
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where: filtered,
        orderBy: reviewOrderBy(sort),
        skip,
        take: limit,
        include,
      }),
      this.prisma.review.count({ where: filtered }),
    ]);
    const result = paginate(rows.map(toReviewItem), total, page, limit);
    return { ...result, meta: { ...result.meta, average, distribution } };
  }

  async listForSeller(sellerUserId: string, query: QueryReviewsDto) {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.ReviewWhereInput = {
      shop: { sellerProfile: { userId: sellerUserId } },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          images: true,
          replies: {
            where: { status: "VISIBLE" },
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true, avatarUrl: true, deletedAt: true } } },
          },
          product: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(
      rows.map((row) => ({
        ...row,
        replies: row.replies.map((reply) => ({
          ...reply,
          author: reply.author.deletedAt
            ? { id: reply.author.id, name: null, avatarUrl: null, deleted: true }
            : { id: reply.author.id, name: reply.author.name, avatarUrl: reply.author.avatarUrl, deleted: false },
        })),
      })),
      total,
      page,
      limit,
    );
  }

  /** Kept for compatibility: writes a seller Reply and the deprecated fields. */
  async reply(sellerUserId: string, reviewId: string, dto: ReplyReviewDto) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, shop: { sellerProfile: { userId: sellerUserId } } },
      select: { id: true },
    });
    if (!review) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Review not found");
    }
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.reply.findFirst({
        where: { reviewId, isSellerReply: true, authorId: sellerUserId },
        select: { id: true },
      });
      if (existing) {
        await tx.reply.update({ where: { id: existing.id }, data: { body: dto.reply } });
      } else {
        await tx.reply.create({
          data: {
            reviewId,
            authorId: sellerUserId,
            body: dto.reply,
            isSellerReply: true,
          },
        });
      }
      // @deprecated mirror for old clients.
      await tx.review.update({
        where: { id: reviewId },
        data: { sellerReply: dto.reply, sellerRepliedAt: new Date() },
      });
    });
    return this.prisma.review.findUniqueOrThrow({ where: { id: reviewId } });
  }

  async report(_sellerUserId: string, reviewId: string, dto: ReportReviewDto) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId },
      select: { id: true },
    });
    if (!review) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Review not found");
    }
    const created = await this.prisma.contentReport.create({
      data: {
        targetType: "REVIEW",
        targetId: reviewId,
        reporterId: _sellerUserId,
        reason: dto.reason,
      },
    });
    // `reviewId` retained for the legacy admin/seller clients.
    return { ...created, reviewId: created.targetId };
  }

  async listReports(query: QueryReviewsDto, status: ReportStatus = "OPEN") {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.ContentReportWhereInput = { status, targetType: "REVIEW" };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.contentReport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.contentReport.count({ where }),
    ]);
    // Resolve the reported reviews for the admin console.
    const reviewIds = rows.map((row) => row.targetId);
    const reviews = await this.prisma.review.findMany({
      where: { id: { in: reviewIds } },
      include: { shop: { select: { id: true, name: true } } },
    });
    const byId = new Map(reviews.map((review) => [review.id, review]));
    return paginate(
      rows.map((row) => ({
        ...row,
        reviewId: row.targetId,
        review: byId.get(row.targetId) ?? null,
      })),
      total,
      page,
      limit,
    );
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
      if (hide && report.targetType === "REVIEW") {
        const review = await tx.review.update({
          where: { id: report.targetId },
          data: { status: "HIDDEN" },
          select: { productId: true, shopId: true },
        });
        await recomputeReviewRatings(tx, review.productId, review.shopId);
      }
    });
    return { resolved: true, hidden: hide };
  }

  async setVisibility(id: string, visible: boolean, actor: AuthenticatedUser) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: { id: true, productId: true, shopId: true, status: true },
    });
    if (!review) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Review not found");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id },
        data: { status: visible ? "VISIBLE" : "HIDDEN" },
      });
      await recomputeReviewRatings(tx, review.productId, review.shopId);
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: visible ? "review.unhide" : "review.hide",
      entityType: "Review",
      entityId: id,
      before: { status: review.status },
      after: { status: visible ? "VISIBLE" : "HIDDEN" },
    });
    return { id, status: visible ? "VISIBLE" : "HIDDEN" };
  }

  private async getOwned(customerId: string, reviewId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, customerId },
      select: { id: true, productId: true, shopId: true, createdAt: true },
    });
    if (!review) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Review not found");
    }
    return review;
  }
}

function reviewOrderBy(sort: ReviewSort): Prisma.ReviewOrderByWithRelationInput[] {
  if (sort === "highest") {
    return [{ rating: "desc" }, { createdAt: "desc" }, { id: "desc" }];
  }
  if (sort === "lowest") {
    return [{ rating: "asc" }, { createdAt: "desc" }, { id: "desc" }];
  }
  return [{ createdAt: "desc" }, { id: "desc" }];
}

function reviewKeyset(sort: ReviewSort, cursor: ReviewCursor): Prisma.ReviewWhereInput {
  const tie: Prisma.ReviewWhereInput = {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
    ],
  };
  if (sort === "newest") {
    return tie;
  }
  const ahead: Prisma.ReviewWhereInput =
    sort === "highest" ? { rating: { lt: cursor.rating } } : { rating: { gt: cursor.rating } };
  return { OR: [ahead, { AND: [{ rating: cursor.rating }, tie] }] };
}

function toReviewItem(row: {
  images: unknown;
  customer: { id: string; name: string; avatarUrl: string | null; deletedAt: Date | null };
  _count: { replies: number };
  [key: string]: unknown;
}) {
  const { _count, ...rest } = row;
  const customer = row.customer.deletedAt
    ? { id: row.customer.id, name: null, avatarUrl: null, deleted: true }
    : {
        id: row.customer.id,
        name: row.customer.name,
        avatarUrl: row.customer.avatarUrl,
        deleted: false,
      };
  return { ...rest, customer, replyCount: _count.replies };
}
