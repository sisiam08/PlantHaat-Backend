import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import type { RequestMeta } from "../../common/utils/request-meta";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { QueryShopsDto } from "./dto/query-shops.dto";

const SHOP_LIST_INCLUDE = {
  sellerProfile: { select: { id: true, businessName: true, status: true } },
} satisfies Prisma.ShopInclude;

@Injectable()
export class AdminShopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: QueryShopsDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.ShopWhereInput = query.status ? { status: query.status } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.shop.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: SHOP_LIST_INCLUDE,
      }),
      this.prisma.shop.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async suspend(
    id: string,
    reason: string | undefined,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ) {
    const shop = await this.getOrThrow(id);
    await this.prisma.shop.update({
      where: { id },
      data: { status: "SUSPENDED", suspendedAt: new Date(), suspensionReason: reason ?? null },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "shop.suspend",
      entityType: "Shop",
      entityId: id,
      before: { status: shop.status },
      after: { status: "SUSPENDED", reason: reason ?? null },
      ...meta,
    });
  }

  async reactivate(id: string, actor: AuthenticatedUser, meta: RequestMeta) {
    const shop = await this.getOrThrow(id);
    await this.prisma.shop.update({
      where: { id },
      data: { status: "ACTIVE", suspendedAt: null, suspensionReason: null },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "shop.reactivate",
      entityType: "Shop",
      entityId: id,
      before: { status: shop.status },
      after: { status: "ACTIVE" },
      ...meta,
    });
  }

  private async getOrThrow(id: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!shop) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Shop not found");
    }
    return shop;
  }
}
