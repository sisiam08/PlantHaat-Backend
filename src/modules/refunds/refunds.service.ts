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
import { LedgerService } from "../ledger/ledger.service";
import type { ProcessRefundDto, QueryRefundsDto, RejectRefundDto } from "./dto/refund.dto";

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  async list(query: QueryRefundsDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.RefundWhereInput = query.status ? { status: query.status } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.refund.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          shopOrder: { select: { id: true, shopOrderNumber: true, commissionAmount: true } },
        },
      }),
      this.prisma.refund.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async approve(id: string, actor: AuthenticatedUser, meta: RequestMeta) {
    const refund = await this.getOrThrow(id);
    if (refund.status !== "REQUESTED") {
      throw AppException.conflict(ErrorCode.REFUND_INVALID_STATUS, "Refund is not requestable");
    }
    const updated = await this.prisma.refund.update({
      where: { id },
      data: { status: "APPROVED", processedById: actor.id },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "refund.approve",
      entityType: "Refund",
      entityId: id,
      before: { status: refund.status },
      after: { status: "APPROVED" },
      ...meta,
    });
    return updated;
  }

  async reject(id: string, dto: RejectRefundDto, actor: AuthenticatedUser, meta: RequestMeta) {
    const refund = await this.getOrThrow(id);
    if (refund.status === "PROCESSED") {
      throw AppException.conflict(ErrorCode.REFUND_INVALID_STATUS, "Refund already processed");
    }
    const updated = await this.prisma.refund.update({
      where: { id },
      data: { status: "REJECTED", note: dto.note ?? refund.note, processedById: actor.id },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "refund.reject",
      entityType: "Refund",
      entityId: id,
      before: { status: refund.status },
      after: { status: "REJECTED" },
      ...meta,
    });
    return updated;
  }

  async process(id: string, dto: ProcessRefundDto, actor: AuthenticatedUser, meta: RequestMeta) {
    const refund = await this.getOrThrow(id, true);
    if (refund.status === "PROCESSED" || refund.status === "REJECTED") {
      throw AppException.conflict(ErrorCode.REFUND_INVALID_STATUS, "Refund cannot be processed");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.refund.update({
        where: { id },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          processedById: actor.id,
          method: dto.method ?? refund.method,
          reference: dto.reference ?? refund.reference,
          note: dto.note ?? refund.note,
        },
      });

      const shopOrder = await tx.shopOrder.findUniqueOrThrow({
        where: { id: refund.shopOrderId },
        select: {
          commissionAmount: true,
          sellerNetAmount: true,
          order: { select: { paymentMethod: true } },
          shop: { select: { sellerProfileId: true } },
        },
      });

      // COD: the seller collected cash and owes commission; a refund removes
      // that commission, so credit it back. Online-paid: reverse the seller
      // share. Complaint resolution may already have reversed it; the helper is
      // idempotent per refund (LedgerEntry.refundId).
      await this.ledger.reverseRefund(tx, {
        refundId: id,
        sellerProfileId: shopOrder.shop.sellerProfileId,
        shopOrderId: refund.shopOrderId,
        commissionAmount: shopOrder.commissionAmount,
        paymentMethod: shopOrder.order.paymentMethod,
        createdById: actor.id,
      });
      if (shopOrder.order.paymentMethod !== "COD") {
        const sellerProfileId = shopOrder.shop.sellerProfileId;
        const onHold = await this.ledger.accountSum(
          tx,
          sellerProfileId,
          "SELLER_ON_HOLD",
          refund.shopOrderId,
        );
        const pending = await this.ledger.accountSum(
          tx,
          sellerProfileId,
          "SELLER_PENDING",
          refund.shopOrderId,
        );
        const available = await this.ledger.accountSum(
          tx,
          sellerProfileId,
          "SELLER_AVAILABLE",
          refund.shopOrderId,
        );
        const commissionRemaining = await this.ledger.accountSum(
          tx,
          sellerProfileId,
          "PLATFORM_COMMISSION",
          refund.shopOrderId,
        );
        await this.ledger.postRefundObligation(tx, {
          refundId: id,
          shopOrderId: refund.shopOrderId,
          sellerProfileId,
          amount: refund.amount,
          refundableSellerFunds: onHold.gt(0)
            ? onHold
            : pending.gt(0)
              ? pending
              : available,
          commissionRemaining,
          source: onHold.gt(0)
            ? "SELLER_ON_HOLD"
            : pending.gt(0)
              ? "SELLER_PENDING"
              : "SELLER_AVAILABLE",
          createdById: actor.id,
        });
        await this.ledger.postRefundPaid(tx, {
          refundId: id,
          amount: refund.amount,
          createdById: actor.id,
        });
      }
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "refund.process",
      entityType: "Refund",
      entityId: id,
      before: { status: refund.status },
      after: { status: "PROCESSED" },
      ...meta,
    });
    return { processed: true };
  }

  private async getOrThrow(id: string, withRelations = false) {
    const refund = await this.prisma.refund.findUnique({
      where: { id },
      include: withRelations
        ? {
            shopOrder: {
              select: { commissionAmount: true, shop: { select: { sellerProfileId: true } } },
            },
          }
        : undefined,
    });
    if (!refund) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Refund not found");
    }
    return refund;
  }
}
