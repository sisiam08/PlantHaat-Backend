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
  QueryReviewsDto,
  ReplyReviewDto,
  ReportReviewDto,
  UpdateReviewDto,
} from "./dto/review.dto";

const REVIEW_EDIT_WINDOW_DAYS = 7;

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
      await this.recomputeRatings(tx, orderItem.productId!, shopOrder.shopId);
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
      await this.recomputeRatings(tx, review.productId, review.shopId);
    });
    return this.prisma.review.findUniqueOrThrow({ where: { id: reviewId } });
  }

  async remove(customerId: string, reviewId: string): Promise<void> {
    const review = await this.getOwned(customerId, reviewId);
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: reviewId } });
      await this.recomputeRatings(tx, review.productId, review.shopId);
    });
  }

  async listForProduct(slug: string, query: QueryReviewsDto) {
    const product = await this.prisma.product.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    });
    if (!product) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Product not found");
    }
    const { page, limit, skip } = resolvePagination(query);
    const where = { productId: product.id, status: "VISIBLE" as const };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          images: true,
          customer: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
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
          product: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async reply(sellerUserId: string, reviewId: string, dto: ReplyReviewDto) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, shop: { sellerProfile: { userId: sellerUserId } } },
      select: { id: true },
    });
    if (!review) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Review not found");
    }
    return this.prisma.review.update({
      where: { id: reviewId },
      data: { sellerReply: dto.reply, sellerRepliedAt: new Date() },
    });
  }

  async report(sellerUserId: string, reviewId: string, dto: ReportReviewDto) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, shop: { sellerProfile: { userId: sellerUserId } } },
      select: { id: true },
    });
    if (!review) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Review not found");
    }
    return this.prisma.reviewReport.create({
      data: { reviewId, reporterId: sellerUserId, reason: dto.reason },
    });
  }

  async listReports(query: QueryReviewsDto, status: ReportStatus = "OPEN") {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.ReviewReportWhereInput = { status };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.reviewReport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { review: { include: { shop: { select: { id: true, name: true } } } } },
      }),
      this.prisma.reviewReport.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async resolveReport(id: string, hide: boolean, actor: AuthenticatedUser) {
    const report = await this.prisma.reviewReport.findUnique({
      where: { id },
      include: { review: { select: { id: true, productId: true, shopId: true } } },
    });
    if (!report) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Report not found");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.reviewReport.update({
        where: { id },
        data: {
          status: hide ? "RESOLVED_HIDDEN" : "RESOLVED_KEPT",
          resolvedById: actor.id,
          resolvedAt: new Date(),
        },
      });
      if (hide) {
        await tx.review.update({
          where: { id: report.review.id },
          data: { status: "HIDDEN" },
        });
      }
      await this.recomputeRatings(tx, report.review.productId, report.review.shopId);
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
      await this.recomputeRatings(tx, review.productId, review.shopId);
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

  private async recomputeRatings(
    tx: Prisma.TransactionClient,
    productId: string,
    shopId: string,
  ): Promise<void> {
    const productAgg = await tx.review.aggregate({
      where: { productId, status: "VISIBLE" },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.product.update({
      where: { id: productId },
      data: {
        ratingAvg: round2(productAgg._avg.rating ?? 0),
        ratingCount: productAgg._count._all,
      },
    });

    const shopAgg = await tx.review.aggregate({
      where: { shopId, status: "VISIBLE" },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await tx.shop.update({
      where: { id: shopId },
      data: {
        ratingAvg: round2(shopAgg._avg.rating ?? 0),
        ratingCount: shopAgg._count._all,
      },
    });
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
