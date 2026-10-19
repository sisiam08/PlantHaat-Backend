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
import type {
  ComplaintCommentDto,
  CreateComplaintDto,
  QueryComplaintsDto,
  ResolveComplaintDto,
  UpdateComplaintStatusDto,
} from "./dto/complaint.dto";

const ATTACHMENT_REQUIRED_TYPES = new Set(["DAMAGED_PLANT", "NOT_AS_DESCRIBED"]);
const SHIPPED_ONLY_TYPES = new Set(["NOT_DELIVERED", "LATE_DELIVERY"]);

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly orders: OrdersService,
  ) {}

  async create(customerId: string, dto: CreateComplaintDto) {
    const shopOrder = await this.prisma.shopOrder.findUnique({
      where: { id: dto.shopOrderId },
      include: {
        order: { select: { customerId: true } },
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

    if (dto.orderItemId) {
      const item = await this.prisma.orderItem.findFirst({
        where: { id: dto.orderItemId, shopOrderId: shopOrder.id },
        select: { id: true },
      });
      if (!item) {
        throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Invalid order item");
      }
    }

    const { complaint, falseDeliveryFlags } = await this.prisma.$transaction(async (tx) => {
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
          attachments: dto.attachments?.length
            ? { create: dto.attachments.map((url) => ({ url })) }
            : undefined,
        },
      });
      let flags: number | null = null;
      if (isDeliveredNotDelivered) {
        const updated = await tx.sellerProfile.update({
          where: { id: shopOrder.shop.sellerProfile.id },
          data: { falseDeliveryFlags: { increment: 1 } },
          select: { falseDeliveryFlags: true },
        });
        flags = updated.falseDeliveryFlags;
      }
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
    const windowHours = await this.settings.getNumber("complaint.windowHours");
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
    return this.paginate(query.status ? { status: query.status } : {}, query);
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
    await this.assertAccess({ id, shop: { sellerProfile: { userId: sellerUserId } } });
    await this.prisma.complaint.update({
      where: { id },
      data: { status: "SELLER_RESPONDED" },
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
