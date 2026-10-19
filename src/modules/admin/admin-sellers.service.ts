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
import { OrdersService } from "../orders/orders.service";
import { STORAGE_SERVICE, type StorageService } from "../uploads/storage/storage.types";
import type { BulkCancelOrdersDto } from "./dto/bulk-cancel-orders.dto";
import type { QuerySellersDto } from "./dto/query-sellers.dto";
import type { SuspendDto } from "./dto/suspend.dto";

const OPEN_ORDER_STATUSES = ["PENDING", "CONFIRMED", "PACKED", "SHIPPED", "FAILED_DELIVERY"] as const;

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
    private readonly orders: OrdersService,
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
    return { ...profile, openOrderCount: await this.openOrderCount(id) };
  }

  async openOrderCount(sellerProfileId: string): Promise<number> {
    return this.prisma.shopOrder.count({
      where: {
        shop: { sellerProfileId },
        status: { in: [...OPEN_ORDER_STATUSES] },
      },
    });
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
    dto: SuspendDto,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ) {
    const profile = await this.getOrThrow(id);
    const openOrderCount = await this.openOrderCount(id);
    await this.prisma.$transaction([
      this.prisma.sellerProfile.update({
        where: { id },
        data: { status: "SUSPENDED" },
      }),
      this.prisma.shop.updateMany({
        where: { sellerProfileId: id },
        data: { status: "SUSPENDED", suspendedAt: new Date(), suspensionReason: dto.reason ?? null },
      }),
    ]);
    let bulkCancel: { cancelledCount: number; skipped: number } | null = null;
    if (dto.cancelOpenOrders) {
      const result = await this.bulkCancelOpenOrders(
        id,
        {
          reason: dto.cancelReason ?? dto.reason ?? "Seller suspended",
          restock: true,
        },
        actor,
        meta,
      );
      bulkCancel = { cancelledCount: result.cancelledCount, skipped: result.skipped };
    }
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "seller.suspend",
      entityType: "SellerProfile",
      entityId: id,
      before: { status: profile.status, openOrderCount },
      after: {
        status: "SUSPENDED",
        reason: dto.reason ?? null,
        cancelOpenOrders: Boolean(dto.cancelOpenOrders),
        bulkCancel,
      },
      ...meta,
    });
    return this.get(id);
  }

  async listSuspendedOpenOrders() {
    const sellers = await this.prisma.sellerProfile.findMany({
      where: { status: "SUSPENDED" },
      select: {
        id: true,
        businessName: true,
        userId: true,
        falseDeliveryFlags: true,
        user: { select: { email: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    const orders = await this.prisma.shopOrder.findMany({
      where: {
        shop: { sellerProfileId: { in: sellers.map((seller) => seller.id) } },
        status: { in: [...OPEN_ORDER_STATUSES] },
      },
      orderBy: { createdAt: "asc" },
      include: {
        shop: { select: { id: true, name: true, slug: true, sellerProfileId: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerId: true,
            contactName: true,
            contactPhone: true,
            placedAt: true,
          },
        },
        items: true,
      },
    });
    const bySeller = new Map<string, typeof orders>();
    for (const order of orders) {
      const key = order.shop.sellerProfileId;
      const list = bySeller.get(key) ?? [];
      list.push(order);
      bySeller.set(key, list);
    }
    return sellers.map((seller) => ({
      sellerProfileId: seller.id,
      businessName: seller.businessName,
      userId: seller.userId,
      email: seller.user.email,
      falseDeliveryFlags: seller.falseDeliveryFlags,
      openOrderCount: bySeller.get(seller.id)?.length ?? 0,
      orders: bySeller.get(seller.id) ?? [],
    }));
  }

  async bulkCancelOpenOrders(
    id: string,
    dto: BulkCancelOrdersDto,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ) {
    await this.getOrThrow(id);
    const open = await this.prisma.shopOrder.findMany({
      where: {
        shop: { sellerProfileId: id },
        status: { in: [...OPEN_ORDER_STATUSES] },
      },
      select: { id: true, total: true },
    });
    let cancelledCount = 0;
    let skipped = 0;
    for (const shopOrder of open) {
      try {
        await this.orders.transitionByAdmin(shopOrder.id, {
          status: "CANCELLED",
          note: dto.reason,
          restock: dto.restock ?? true,
        });
        cancelledCount += 1;
        // Online-paid orders (future) need a refund request; COD payments are
        // cancelled by the transition.
        const paid = await this.prisma.payment.findFirst({
          where: { shopOrderId: shopOrder.id, status: "PAID" },
          select: { id: true },
        });
        if (paid) {
          const existing = await this.prisma.refund.findFirst({
            where: { shopOrderId: shopOrder.id, status: { not: "REJECTED" } },
            select: { id: true },
          });
          if (!existing) {
            await this.prisma.refund.create({
              data: {
                shopOrderId: shopOrder.id,
                paymentId: paid.id,
                amount: shopOrder.total,
                reason: dto.reason,
                status: "REQUESTED",
                requestedById: actor.id,
              },
            });
          }
        }
      } catch {
        skipped += 1;
      }
    }
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "seller.bulk_cancel_orders",
      entityType: "SellerProfile",
      entityId: id,
      after: { requested: open.length, cancelledCount, skipped, reason: dto.reason },
      ...meta,
    });
    return {
      sellerProfileId: id,
      cancelledCount,
      skipped,
      openOrderCount: await this.openOrderCount(id),
    };
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
