import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import type { RequestMeta } from "../../common/utils/request-meta";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { QueryAdminProductsDto } from "./dto/query-admin-products.dto";

const PRODUCT_MODERATION_INCLUDE = {
  shop: { select: { id: true, name: true, sellerProfile: { select: { userId: true } } } },
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async list(query: QueryAdminProductsDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: PRODUCT_MODERATION_INCLUDE,
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async approve(id: string, actor: AuthenticatedUser, meta: RequestMeta) {
    const product = await this.getOrThrow(id);
    await this.prisma.product.update({
      where: { id },
      data: { status: "ACTIVE", publishedAt: new Date(), rejectionReason: null },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "product.approve",
      entityType: "Product",
      entityId: id,
      before: { status: product.status },
      after: { status: "ACTIVE" },
      ...meta,
    });
    this.emitModerated(product, "ACTIVE");
    return { id, status: "ACTIVE" };
  }

  async reject(id: string, reason: string, actor: AuthenticatedUser, meta: RequestMeta) {
    const product = await this.getOrThrow(id);
    await this.prisma.product.update({
      where: { id },
      data: { status: "REJECTED", rejectionReason: reason },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "product.reject",
      entityType: "Product",
      entityId: id,
      before: { status: product.status },
      after: { status: "REJECTED", reason },
      ...meta,
    });
    this.emitModerated(product, "REJECTED");
    return { id, status: "REJECTED" };
  }

  async remove(id: string, reason: string, actor: AuthenticatedUser, meta: RequestMeta) {
    const product = await this.getOrThrow(id);
    await this.prisma.product.update({
      where: { id },
      data: { status: "REMOVED", rejectionReason: reason },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "product.remove",
      entityType: "Product",
      entityId: id,
      before: { status: product.status },
      after: { status: "REMOVED", reason },
      ...meta,
    });
    this.events.emit("product.changed");
    return { id, status: "REMOVED" };
  }

  private emitModerated(
    product: { id: string; name: string; shop: { sellerProfile: { userId: string } } },
    status: "ACTIVE" | "REJECTED",
  ): void {
    this.events.emit("product.moderated", {
      productId: product.id,
      userId: product.shop.sellerProfile.userId,
      productName: product.name,
      status,
    });
  }

  private async getOrThrow(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        shop: { select: { sellerProfile: { select: { userId: true } } } },
      },
    });
    if (!product) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Product not found");
    }
    return product;
  }
}
