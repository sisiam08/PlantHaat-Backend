import { Inject, Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import type { RequestMeta } from "../../common/utils/request-meta";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { STORAGE_SERVICE, type StorageService } from "../uploads/storage/storage.types";
import type { QuerySellersDto } from "./dto/query-sellers.dto";

const SELLER_LIST_INCLUDE = {
  user: { select: { id: true, email: true, name: true, status: true } },
  shops: { select: { id: true, name: true, slug: true, status: true } },
} satisfies Prisma.SellerProfileInclude;

@Injectable()
export class AdminSellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async list(query: QuerySellersDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.SellerProfileWhereInput = query.status ? { status: query.status } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sellerProfile.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: SELLER_LIST_INCLUDE,
      }),
      this.prisma.sellerProfile.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async get(id: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, name: true, phone: true, status: true } },
        documents: { orderBy: { createdAt: "asc" } },
        shops: { orderBy: { createdAt: "asc" } },
        payoutAccounts: {
          select: {
            id: true,
            method: true,
            accountName: true,
            accountMasked: true,
            isDefault: true,
            createdAt: true,
          },
        },
      },
    });
    if (!profile) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Seller not found");
    }
    return profile;
  }

  async approve(id: string, actor: AuthenticatedUser, meta: RequestMeta) {
    const profile = await this.getOrThrow(id);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.sellerProfile.update({
        where: { id },
        data: {
          status: "APPROVED",
          verifiedAt: now,
          reviewedAt: now,
          reviewedById: actor.id,
          rejectionReason: null,
        },
      }),
      this.prisma.shop.updateMany({
        where: { sellerProfileId: id },
        data: { status: "ACTIVE", approvedAt: now, suspendedAt: null, suspensionReason: null },
      }),
    ]);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "seller.approve",
      entityType: "SellerProfile",
      entityId: id,
      before: { status: profile.status },
      after: { status: "APPROVED" },
      ...meta,
    });
    this.events.emit("seller.approved", {
      sellerProfileId: id,
      userId: profile.userId,
      businessName: profile.businessName,
    });
    return this.get(id);
  }

  async reject(id: string, reason: string, actor: AuthenticatedUser, meta: RequestMeta) {
    const profile = await this.getOrThrow(id);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.sellerProfile.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectionReason: reason,
          reviewedAt: now,
          reviewedById: actor.id,
        },
      }),
      this.prisma.shop.updateMany({
        where: { sellerProfileId: id },
        data: { status: "REJECTED" },
      }),
    ]);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "seller.reject",
      entityType: "SellerProfile",
      entityId: id,
      before: { status: profile.status },
      after: { status: "REJECTED", reason },
      ...meta,
    });
    this.events.emit("seller.rejected", {
      sellerProfileId: id,
      userId: profile.userId,
      businessName: profile.businessName,
      reason,
    });
    return this.get(id);
  }

  async suspend(
    id: string,
    reason: string | undefined,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ) {
    const profile = await this.getOrThrow(id);
    await this.prisma.$transaction([
      this.prisma.sellerProfile.update({
        where: { id },
        data: { status: "SUSPENDED" },
      }),
      this.prisma.shop.updateMany({
        where: { sellerProfileId: id },
        data: { status: "SUSPENDED", suspendedAt: new Date(), suspensionReason: reason ?? null },
      }),
    ]);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "seller.suspend",
      entityType: "SellerProfile",
      entityId: id,
      before: { status: profile.status },
      after: { status: "SUSPENDED", reason: reason ?? null },
      ...meta,
    });
    return this.get(id);
  }

  async reactivate(id: string, actor: AuthenticatedUser, meta: RequestMeta) {
    const profile = await this.getOrThrow(id);
    await this.prisma.$transaction([
      this.prisma.sellerProfile.update({
        where: { id },
        data: { status: "APPROVED" },
      }),
      this.prisma.shop.updateMany({
        where: { sellerProfileId: id },
        data: { status: "ACTIVE", suspendedAt: null, suspensionReason: null },
      }),
    ]);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "seller.reactivate",
      entityType: "SellerProfile",
      entityId: id,
      before: { status: profile.status },
      after: { status: "APPROVED" },
      ...meta,
    });
    return this.get(id);
  }

  async getDocumentPath(sellerProfileId: string, documentId: string): Promise<string> {
    const document = await this.prisma.sellerDocument.findFirst({
      where: { id: documentId, sellerProfileId },
      select: { fileKey: true },
    });
    if (!document) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Document not found");
    }
    return this.storage.getPrivateUrl(document.fileKey);
  }

  private async getOrThrow(id: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true, businessName: true },
    });
    if (!profile) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Seller not found");
    }
    return profile;
  }
}
