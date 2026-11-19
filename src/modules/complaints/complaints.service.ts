import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import { generateComplaintTicket } from "../../common/utils/order-number";
import { Prisma } from "../../generated/prisma/client";
import type { Role } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LedgerService } from "../ledger/ledger.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrdersService } from "../orders/orders.service";
import { SettingsService } from "../settings/settings.service";
import { UploadsService } from "../uploads/uploads.service";
import type {
  ComplaintCommentDto,
  CreateComplaintDto,
  DecideDisputeDto,
  QueryComplaintsDto,
  ResolveComplaintDto,
  UpdateComplaintStatusDto,
} from "./dto/complaint.dto";

const ATTACHMENT_REQUIRED_TYPES = new Set(["DAMAGED_PLANT", "NOT_AS_DESCRIBED"]);
const SHIPPED_ONLY_TYPES = new Set(["NOT_DELIVERED", "LATE_DELIVERY"]);
const OPEN_DISPUTE_STATUSES = ["OPEN", "SELLER_RESPONDED", "UNDER_REVIEW"] as const;

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly orders: OrdersService,
    private readonly uploads: UploadsService,
  ) {}

  async create(customerId: string, dto: CreateComplaintDto) {
    const shopOrder = await this.prisma.shopOrder.findUnique({
      where: { id: dto.shopOrderId },
      include: {
        order: { select: { customerId: true, paymentMethod: true } },
        shop: {
          select: {
            id: true,
            name: true,
            sellerProfile: { select: { id: true, userId: true } },
          },
        },
      },
    });
    if (!shopOrder || shopOrder.order.customerId !== customerId) {
      throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    }

    const isShipped = ["SHIPPED", "FAILED_DELIVERY"].includes(shopOrder.status);
    const isDeliveredNotDelivered =
      dto.type === "NOT_DELIVERED" && shopOrder.status === "DELIVERED";

    if (dto.type === "NOT_DELIVERED") {
      if (!isShipped && shopOrder.status !== "DELIVERED") {
        throw AppException.badRequest(
          ErrorCode.COMPLAINT_NOT_ALLOWED,
          "This complaint type requires a shipped or delivered order",
        );
      }
      if (shopOrder.status === "DELIVERED") {
        await this.assertWithinComplaintWindow(shopOrder.deliveredAt);
      }
    } else if (SHIPPED_ONLY_TYPES.has(dto.type)) {
      if (!isShipped) {
        throw AppException.badRequest(
          ErrorCode.COMPLAINT_NOT_ALLOWED,
          "This complaint type requires a shipped order",
        );
      }
    } else {
      if (shopOrder.status !== "DELIVERED") {
        throw AppException.badRequest(
          ErrorCode.COMPLAINT_NOT_ALLOWED,
          "You can complain only about delivered orders",
        );
      }
      await this.assertWithinComplaintWindow(shopOrder.deliveredAt);
    }

    if (ATTACHMENT_REQUIRED_TYPES.has(dto.type) && (dto.attachments?.length ?? 0) === 0) {
      throw AppException.badRequest(
        ErrorCode.COMPLAINT_ATTACHMENT_REQUIRED,
        "At least one photo is required for this complaint type",
      );
    }
    const photoRequired = await this.settings.getBoolean("return.photoRequired");
    if (
      shopOrder.status === "DELIVERED" &&
      photoRequired &&
      (dto.attachments?.length ?? 0) === 0
    ) {
      throw AppException.badRequest(
        ErrorCode.COMPLAINT_ATTACHMENT_REQUIRED,
        "At least one photo is required for a dispute",
      );
    }
    const maxPhotos = await this.settings.getNumber("return.maxEvidencePhotos");
    if ((dto.attachments?.length ?? 0) > maxPhotos) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        `At most ${maxPhotos} photos are allowed`,
      );
    }
    const openDispute = await this.prisma.complaint.findFirst({
      where: {
        shopOrderId: shopOrder.id,
        customerId,
        status: { in: [...OPEN_DISPUTE_STATUSES] },
      },
      select: { id: true },
    });
    if (openDispute) {
      throw AppException.conflict(
        ErrorCode.COMPLAINT_NOT_ALLOWED,
        "A dispute is already open for this order",
      );
    }

    if (dto.orderItemId) {
      const item = await this.prisma.orderItem.findFirst({
        where: { id: dto.orderItemId, shopOrderId: shopOrder.id },
        select: { id: true },
      });
      if (!item) {
        throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Invalid order item");
      }
    }

    const responseHours = await this.settings.getNumber("return.disputeSellerHours");
    const sellerResponseDueAt =
      shopOrder.status === "DELIVERED" ? new Date(Date.now() + responseHours * 3_600_000) : null;

    const { complaint, falseDeliveryFlags } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ShopOrder" WHERE "id" = ${shopOrder.id} FOR UPDATE`;
      const created = await tx.complaint.create({
        data: {
          ticketNumber: generateComplaintTicket(),
          shopOrderId: shopOrder.id,
          orderItemId: dto.orderItemId ?? null,
          customerId,
          shopId: shopOrder.shopId,
          type: dto.type,
          description: dto.description,
          status: "OPEN",
          sellerResponseDueAt,
          attachments: dto.attachments?.length
            ? { create: dto.attachments.map((url) => ({ url })) }
            : undefined,
        },
      });
      if (shopOrder.status === "DELIVERED" && shopOrder.order.paymentMethod === "ADVANCE") {
        await this.ledger.holdForDispute(tx, {
          disputeId: created.id,
          shopOrderId: shopOrder.id,
          sellerProfileId: shopOrder.shop.sellerProfile.id,
          createdById: customerId,
        });
        await tx.complaint.update({
          where: { id: created.id },
          data: { fundsHeldAt: new Date() },
        });
      }
      let flags: number | null = null;
      if (isDeliveredNotDelivered) {
        const updated = await tx.sellerProfile.update({
          where: { id: shopOrder.shop.sellerProfile.id },
          data: { falseDeliveryFlags: { increment: 1 } },
          select: { falseDeliveryFlags: true },
        });
        flags = updated.falseDeliveryFlags;
      }
      await this.uploads.attachAssetsInTransaction(tx, dto.attachments ?? []);
      return { complaint: created, falseDeliveryFlags: flags };
    });

    await this.notifications.create({
      userId: shopOrder.shop.sellerProfile.userId,
      type: "COMPLAINT_UPDATED",
      title: "New complaint",
      body: `A customer opened complaint ${complaint.ticketNumber}.`,
      data: { complaintId: complaint.id },
    });

    if (isDeliveredNotDelivered) {
      // A delivered order reported as not delivered is a potential false
      // delivery: tell admins immediately and keep the seller's counter.
      await this.notifications.createForAdmins({
        type: "FALSE_DELIVERY_FLAG",
        title: "Delivered order reported as not delivered",
        body: `${shopOrder.shop.name} marked ${shopOrder.shopOrderNumber} delivered, but the customer says it never arrived (complaint ${complaint.ticketNumber}).`,
        data: {
          complaintId: complaint.id,
          shopOrderId: shopOrder.id,
          shopId: shopOrder.shopId,
          sellerProfileId: shopOrder.shop.sellerProfile.id,
          sellerFalseDeliveryFlags: falseDeliveryFlags,
        },
      });
    }

    return complaint;
  }

  private async assertWithinComplaintWindow(deliveredAt: Date | null): Promise<void> {
    const windowHours = await this.settings.getNumber("return.windowHours");
    if (!deliveredAt || Date.now() > deliveredAt.getTime() + windowHours * 3_600_000) {
      throw AppException.badRequest(
        ErrorCode.COMPLAINT_WINDOW_CLOSED,
        "The complaint window has closed",
      );
    }
  }

  async listMine(customerId: string, query: QueryComplaintsDto): Promise<PaginatedResult<unknown>> {
    return this.paginate({ customerId, ...(query.status ? { status: query.status } : {}) }, query);
  }

  async listForSeller(
    sellerUserId: string,
    query: QueryComplaintsDto,
  ): Promise<PaginatedResult<unknown>> {
    return this.paginate(
      {
        shop: { sellerProfile: { userId: sellerUserId } },
        ...(query.status ? { status: query.status } : {}),
      },
      query,
    );
  }

  async listAll(query: QueryComplaintsDto): Promise<PaginatedResult<unknown>> {
    const now = Date.now();
    const where: Prisma.ComplaintWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.seller?.trim()
        ? {
            shop: {
              is: {
                OR: [
                  { name: { contains: query.seller.trim(), mode: "insensitive" } },
                  {
                    sellerProfile: {
                      businessName: { contains: query.seller.trim(), mode: "insensitive" },
                    },
                  },
                ],
              },
            },
          }
        : {}),
      ...(query.minAgeHours !== undefined || query.maxAgeHours !== undefined
        ? {
            createdAt: {
              ...(query.minAgeHours !== undefined
                ? { lte: new Date(now - query.minAgeHours * 3_600_000) }
                : {}),
              ...(query.maxAgeHours !== undefined
                ? { gte: new Date(now - query.maxAgeHours * 3_600_000) }
                : {}),
            },
          }
        : {}),
      ...(query.minAmount !== undefined || query.maxAmount !== undefined
        ? {
            shopOrder: {
              is: {
                total: {
                  ...(query.minAmount !== undefined ? { gte: query.minAmount } : {}),
                  ...(query.maxAmount !== undefined ? { lte: query.maxAmount } : {}),
                },
              },
            },
          }
        : {}),
    };
    return this.paginate(where, query);
  }

  async getForCustomer(customerId: string, id: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, customerId },
      include: {
        attachments: true,
        refunds: true,
        comments: { where: { isInternal: false }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!complaint) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Complaint not found");
    }
    return complaint;
  }

  async getForSeller(sellerUserId: string, id: string) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, shop: { sellerProfile: { userId: sellerUserId } } },
      include: {
        attachments: true,
        comments: { where: { isInternal: false }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!complaint) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Complaint not found");
    }
    return complaint;
  }

  async getAny(id: string) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id },
      include: {
        attachments: true,
        refunds: true,
        comments: { orderBy: { createdAt: "asc" } },
        shop: {
          select: {
            id: true,
            name: true,
            slug: true,
            sellerProfile: { select: { id: true, businessName: true } },
          },
        },
        shopOrder: {
          select: {
            id: true,
            shopOrderNumber: true,
            status: true,
            subtotal: true,
            deliveryCharge: true,
            total: true,
            commissionAmount: true,
            sellerNetAmount: true,
            releaseAt: true,
            fundsReleasedAt: true,
            order: { select: { orderNumber: true, paymentMethod: true } },
          },
        },
      },
    });
    if (!complaint) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Complaint not found");
    }
    return complaint;
  }

  async addCustomerComment(customerId: string, id: string, dto: ComplaintCommentDto) {
    await this.assertAccess({ id, customerId });
    return this.addComment(id, customerId, "CUSTOMER", dto.body, false);
  }

  async addSellerComment(sellerUserId: string, id: string, dto: ComplaintCommentDto) {
    const complaint = await this.prisma.complaint.findFirst({
      where: { id, shop: { sellerProfile: { userId: sellerUserId } } },
      select: { id: true, sellerResponseDueAt: true, decision: true },
    });
    if (!complaint) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Complaint not found");
    }
    if (
      complaint.sellerResponseDueAt &&
      Date.now() > complaint.sellerResponseDueAt.getTime()
    ) {
      throw AppException.badRequest(
        ErrorCode.COMPLAINT_NOT_ALLOWED,
        "The seller response window has closed",
      );
    }
    if (complaint.decision !== "PENDING") {
      throw AppException.conflict(
        ErrorCode.COMPLAINT_NOT_ALLOWED,
        "This dispute has already been decided",
      );
    }
    await this.prisma.complaint.update({
      where: { id },
      data: { status: "SELLER_RESPONDED", sellerRespondedAt: new Date() },
    });
    return this.addComment(id, sellerUserId, "SELLER", dto.body, false);
  }

  async addAdminComment(actor: AuthenticatedUser, id: string, dto: ComplaintCommentDto) {
    await this.getAny(id);
    return this.addComment(id, actor.id, "ADMIN", dto.body, dto.isInternal ?? false);
  }

  async updateStatus(
    id: string,
    dto: UpdateComplaintStatusDto,
    actor: AuthenticatedUser,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    await this.getAny(id);
    if (dto.status === "RESOLVED_REFUND" || dto.status === "RESOLVED_REPLACEMENT") {
      throw AppException.badRequest(
        ErrorCode.COMPLAINT_NOT_ALLOWED,
        "Use the resolve endpoint for refunds and replacements",
      );
    }
    await this.prisma.complaint.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.resolutionNote !== undefined ? { resolutionNote: dto.resolutionNote } : {}),
        resolvedById: actor.id,
        resolvedAt: new Date(),
      },
    });
    await this.notifyParticipants(id);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "complaint.status",
      entityType: "Complaint",
      entityId: id,
      after: { status: dto.status },
      ...meta,
    });
    return this.getAny(id);
  }

  /**
   * Admin dispute decision (Part 4). Locks the complaint and its ShopOrder,
   * moves held funds and posts append-only ledger entries. Idempotent: a replay
   * of the same decision returns the stored result.
   */
  async decide(
    id: string,
    dto: DecideDisputeDto,
    actor: AuthenticatedUser,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Complaint" WHERE "id" = ${id} FOR UPDATE`;
      const complaint = await tx.complaint.findUnique({
        where: { id },
        include: {
          shopOrder: {
            select: {
              id: true,
              shopOrderNumber: true,
              status: true,
              total: true,
              commissionAmount: true,
              sellerNetAmount: true,
              releaseAt: true,
              fundsReleasedAt: true,
              order: { select: { paymentMethod: true } },
              shop: { select: { sellerProfileId: true } },
            },
          },
        },
      });
      if (!complaint) {
        throw AppException.notFound(ErrorCode.NOT_FOUND, "Dispute not found");
      }
      if (complaint.decision !== "PENDING") {
        throw AppException.conflict(
          ErrorCode.DISPUTE_INVALID_STATE,
          "This dispute has already been decided",
        );
      }
      await tx.$queryRaw`SELECT "id" FROM "ShopOrder" WHERE "id" = ${complaint.shopOrderId} FOR UPDATE`;

      const shopOrder = complaint.shopOrder;
      const sellerProfileId = shopOrder.shop.sellerProfileId;
      const held = await this.ledger.accountSum(
        tx,
        sellerProfileId,
        "SELLER_ON_HOLD",
        shopOrder.id,
      );
      const pending = await this.ledger.accountSum(
        tx,
        sellerProfileId,
        "SELLER_PENDING",
        shopOrder.id,
      );
      const available = await this.ledger.accountSum(
        tx,
        sellerProfileId,
        "SELLER_AVAILABLE",
        shopOrder.id,
      );
      const source =
        held.gt(0) ? "SELLER_ON_HOLD" : pending.gt(0) ? "SELLER_PENDING" : "SELLER_AVAILABLE";
      const sellerFunds = held.gt(0) ? held : pending.gt(0) ? pending : available;

      if (dto.decision === "REJECTED" || dto.decision === "RETURN_TO_SELLER") {
        const alreadyReleased =
          shopOrder.fundsReleasedAt !== null ||
          (shopOrder.releaseAt !== null && shopOrder.releaseAt <= new Date());
        if (sellerFunds.gt(0)) {
          await this.ledger.releaseDisputeHold(tx, {
            disputeId: id,
            shopOrderId: shopOrder.id,
            sellerProfileId,
            amount: sellerFunds,
            to: alreadyReleased ? "SELLER_AVAILABLE" : "SELLER_PENDING",
            releaseAt: shopOrder.releaseAt,
            createdById: actor.id,
          });
        }
        if (alreadyReleased && shopOrder.fundsReleasedAt === null) {
          await tx.shopOrder.update({
            where: { id: shopOrder.id },
            data: { fundsReleasedAt: new Date() },
          });
        }
        await tx.complaint.update({
          where: { id },
          data: {
            status: dto.decision === "REJECTED" ? "REJECTED" : "CLOSED",
            decision: dto.decision,
            resolutionNote: dto.reason,
            resolvedById: actor.id,
            resolvedAt: new Date(),
            decidedAt: new Date(),
          },
        });
        return { complaint: await tx.complaint.findUniqueOrThrow({ where: { id } }), replay: false };
      }

      const isFull = dto.decision === "REFUND_FULL";
      const refundAmount = isFull
        ? new Prisma.Decimal(shopOrder.total)
        : new Prisma.Decimal(dto.refundAmount ?? 0);
      if (refundAmount.lte(0) || refundAmount.gt(shopOrder.total)) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          "Refund amount must be between 0.01 and the order total",
        );
      }
      const commissionRemaining = await this.ledger.accountSum(
        tx,
        sellerProfileId,
        "PLATFORM_COMMISSION",
        shopOrder.id,
      );
      const refund = await tx.refund.create({
        data: {
          shopOrderId: shopOrder.id,
          complaintId: id,
          amount: refundAmount,
          reason: dto.reason,
          status: dto.refundTrxId ? "PROCESSED" : "REQUESTED",
          method: dto.refundTrxId ? "BKASH" : null,
          reference: dto.refundTrxId ?? null,
          requestedById: actor.id,
          processedById: dto.refundTrxId ? actor.id : null,
          processedAt: dto.refundTrxId ? new Date() : null,
        },
      });
      await this.ledger.postRefundObligation(tx, {
        refundId: refund.id,
        shopOrderId: shopOrder.id,
        sellerProfileId,
        amount: refundAmount,
        refundableSellerFunds: sellerFunds,
        commissionRemaining,
        source,
        createdById: actor.id,
      });
      if (dto.refundTrxId) {
        await this.ledger.postRefundPaid(tx, {
          refundId: refund.id,
          amount: refundAmount,
          createdById: actor.id,
        });
      }
      await tx.complaint.update({
        where: { id },
        data: {
          status: "RESOLVED_REFUND",
          decision: isFull ? "REFUND_FULL" : "REFUND_PARTIAL",
          resolutionNote: dto.reason,
          refundAmount,
          resolvedById: actor.id,
          resolvedAt: new Date(),
          decidedAt: new Date(),
        },
      });
      return { complaint: await tx.complaint.findUniqueOrThrow({ where: { id } }), replay: false };
    });

    if (!result.replay) {
      await this.notifyParticipants(id);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role,
        action: "dispute.decide",
        entityType: "Complaint",
        entityId: id,
        after: { decision: dto.decision, refundAmount: dto.refundAmount ?? null },
        ...meta,
      });
    }
    return this.getAny(id);
  }

  async resolve(
    id: string,
    dto: ResolveComplaintDto,
    actor: AuthenticatedUser,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id },
      include: {
        shopOrder: {
          select: {
            id: true,
            shopOrderNumber: true,
            total: true,
            commissionAmount: true,
            status: true,
            order: { select: { paymentMethod: true } },
            shop: { select: { sellerProfileId: true } },
          },
        },
      },
    });
    if (!complaint) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Complaint not found");
    }

    // Replacement creation runs in its own transaction and is idempotent, so a
    // retry after a partial failure returns the existing replacement.
    if (dto.status === "RESOLVED_REPLACEMENT") {
      await this.orders.createReplacementFromComplaint({
        parentShopOrderId: complaint.shopOrderId,
        complaintId: id,
        actorId: actor.id,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.complaint.update({
        where: { id },
        data: {
          status: dto.status,
          resolutionNote: dto.resolutionNote ?? null,
          resolvedById: actor.id,
          resolvedAt: new Date(),
        },
      });
      if (dto.status === "RESOLVED_REFUND") {
        const refund = await tx.refund.create({
          data: {
            shopOrderId: complaint.shopOrderId,
            complaintId: id,
            amount:
              dto.refundAmount !== undefined
                ? new Prisma.Decimal(dto.refundAmount)
                : complaint.shopOrder.total,
            reason: dto.resolutionNote ?? "Complaint resolved with refund",
            status: "REQUESTED",
            requestedById: actor.id,
          },
        });
        // Reverse the seller's ledger immediately (idempotent per refund); the
        // admin still processes the actual payout of the refund later.
        await this.ledger.reverseRefund(tx, {
          refundId: refund.id,
          sellerProfileId: complaint.shopOrder.shop.sellerProfileId,
          shopOrderId: complaint.shopOrderId,
          commissionAmount: complaint.shopOrder.commissionAmount,
          paymentMethod: complaint.shopOrder.order.paymentMethod,
          createdById: actor.id,
        });
      }
    });

    await this.notifyParticipants(id);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "complaint.resolve",
      entityType: "Complaint",
      entityId: id,
      before: { status: complaint.status },
      after: { status: dto.status, refundAmount: dto.refundAmount ?? null },
      ...meta,
    });
    return this.getAny(id);
  }

  private async addComment(
    complaintId: string,
    authorId: string,
    authorRole: Role,
    body: string,
    isInternal: boolean,
  ) {
    return this.prisma.complaintComment.create({
      data: { complaintId, authorId, authorRole, body, isInternal },
    });
  }

  private async notifyParticipants(complaintId: string): Promise<void> {
    const complaint = await this.prisma.complaint.findUnique({
      where: { id: complaintId },
      select: {
        customerId: true,
        shop: { select: { sellerProfile: { select: { userId: true } } } },
      },
    });
    if (!complaint) return;
    const userIds = [complaint.customerId, complaint.shop.sellerProfile.userId];
    for (const userId of userIds) {
      await this.notifications.create({
        userId,
        type: "COMPLAINT_UPDATED",
        title: "Complaint updated",
        body: "There is an update on a complaint.",
        data: { complaintId },
      });
    }
  }

  private async assertAccess(where: Prisma.ComplaintWhereInput): Promise<void> {
    const complaint = await this.prisma.complaint.findFirst({ where, select: { id: true } });
    if (!complaint) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Complaint not found");
    }
  }

  private async paginate(
    where: Prisma.ComplaintWhereInput,
    query: QueryComplaintsDto,
  ): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.complaint.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          attachments: true,
          shop: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.complaint.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }
}
