import { Injectable, Logger } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { Prisma } from "../../generated/prisma/client";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { RequestMeta } from "../../common/utils/request-meta";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LedgerService } from "../ledger/ledger.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SettingsService } from "../settings/settings.service";
import type {
  AdvanceProvider,
  CreatePaymentSubmissionDto,
} from "./dto/payment.dto";

interface ProviderAccount {
  provider: AdvanceProvider;
  number: string;
}

interface ProviderSnapshot {
  providers: ProviderAccount[];
  instructions: string;
  warningText: string;
  accountNote: string;
  verificationText: string;
  expiryHours: number;
  slaHours: number;
  lateGraceHours: number;
  capturedAt: string;
}

const MAX_SUBMISSIONS_PER_HOUR = 8;

function stringSetting(value: unknown): string {
  return typeof value === "string" ? value : "";
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  async snapshot(): Promise<ProviderSnapshot> {
    const values = await this.settings.getAll();
    const providers: ProviderAccount[] = [];
    if (
      values["payment.bkash.enabled"] === true &&
      typeof values["payment.bkash.number"] === "string" &&
      values["payment.bkash.number"]
    ) {
      providers.push({ provider: "BKASH", number: values["payment.bkash.number"] });
    }
    if (
      values["payment.nagad.enabled"] === true &&
      typeof values["payment.nagad.number"] === "string" &&
      values["payment.nagad.number"]
    ) {
      providers.push({ provider: "NAGAD", number: values["payment.nagad.number"] });
    }
    return {
      providers,
      instructions: stringSetting(values["payment.instructions"]),
      warningText: stringSetting(values["payment.warningText"]),
      accountNote: stringSetting(values["payment.accountNote"]),
      verificationText: stringSetting(values["payment.verificationText"]),
      expiryHours: Number(values["payment.expiryHours"] ?? 12),
      slaHours: Number(values["payment.slaHours"] ?? 24),
      lateGraceHours: Number(values["payment.lateGraceHours"] ?? 48),
      capturedAt: new Date().toISOString(),
    };
  }

  async createIntent(
    tx: Prisma.TransactionClient,
    input: {
      orderId: string;
      amountDue: Prisma.Decimal;
      allocations: { shopOrderId: string; amount: Prisma.Decimal }[];
      snapshot: ProviderSnapshot;
    },
  ) {
    const expiresAt = new Date(Date.now() + input.snapshot.expiryHours * 3_600_000);
    return tx.paymentIntent.create({
      data: {
        orderId: input.orderId,
        amountDue: input.amountDue,
        providerSnapshot: input.snapshot as unknown as Prisma.InputJsonValue,
        expiresAt,
        status: "UNPAID",
        allocations: {
          create: input.allocations.map((allocation) => ({
            shopOrderId: allocation.shopOrderId,
            amount: allocation.amount,
          })),
        },
      },
    });
  }

  private snapshotOf(value: Prisma.JsonValue): ProviderSnapshot {
    return value as unknown as ProviderSnapshot;
  }

  /**
   * Payment proofs must reference an image uploaded through our own storage.
   * Accepts a storage key (`payments/<ownerId>/<file>`) or a URL whose path
   * points at that key, resolves it through `UploadedAsset` (same owner,
   * purpose "payment") and returns the canonical stored URL. Anything else
   * (external hosts, data:/javascript: URLs, another user's upload) is
   * rejected so admins never render arbitrary remote content.
   */
  private async resolveProofUrl(customerId: string, raw: string | undefined): Promise<string | null> {
    const value = (raw ?? "").trim();
    if (!value) return null;
    if (value.length > 700) {
      throw AppException.badRequest(ErrorCode.PAYMENT_PROOF_INVALID, "Payment proof reference is too long");
    }
    if (/^(?:data|javascript|file|vbscript|blob):/i.test(value)) {
      throw AppException.badRequest(ErrorCode.PAYMENT_PROOF_INVALID, "Payment proof must be an uploaded image");
    }

    const keyPattern = /^payments\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\.(?:webp|jpe?g|png|heic|heif)$/i;
    let key: string | null;
    if (value.startsWith("payments/")) {
      key = value;
    } else {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw AppException.badRequest(ErrorCode.PAYMENT_PROOF_INVALID, "Payment proof must be an uploaded image");
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw AppException.badRequest(ErrorCode.PAYMENT_PROOF_INVALID, "Payment proof must be an uploaded image");
      }
      const match = /\/(payments\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\.(?:webp|jpe?g|png|heic|heif))$/i.exec(
        url.pathname,
      );
      key = match?.[1] ?? null;
    }
    if (!key || !keyPattern.test(key)) {
      throw AppException.badRequest(ErrorCode.PAYMENT_PROOF_INVALID, "Payment proof must be an uploaded image");
    }
    if (!key.startsWith(`payments/${customerId}/`)) {
      throw AppException.badRequest(ErrorCode.PAYMENT_PROOF_INVALID, "Payment proof belongs to another account");
    }
    const asset = await this.prisma.uploadedAsset.findFirst({
      where: { publicId: key, ownerId: customerId, purpose: "payment" },
    });
    if (!asset?.url) {
      throw AppException.badRequest(
        ErrorCode.PAYMENT_PROOF_INVALID,
        "Upload the payment proof again through the app",
      );
    }
    return asset.url;
  }

  private submissionTotals(submissions: { amountReceived: Prisma.Decimal | null; status: string }[]) {
    return submissions
      .filter((row) => row.amountReceived != null && row.status !== "PENDING")
      .reduce((sum, row) => sum.plus(row.amountReceived as Prisma.Decimal), new Prisma.Decimal(0));
  }

  private async lockIntent(tx: Prisma.TransactionClient, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "PaymentIntent" WHERE "id" = ${id} FOR UPDATE
    `;
    if (rows.length === 0) throw AppException.notFound(ErrorCode.PAYMENT_NOT_FOUND, "Payment not found");
  }

  async buyerInfo(customerId: string, orderId: string) {
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { orderId, order: { customerId } },
      include: {
        submissions: { orderBy: { createdAt: "desc" } },
        order: { select: { orderNumber: true, grandTotal: true, paymentStatus: true } },
      },
    });
    if (!intent) throw AppException.notFound(ErrorCode.PAYMENT_NOT_FOUND, "Payment not found");
    const paid = this.submissionTotals(intent.submissions);
    const remaining = Prisma.Decimal.max(intent.amountDue.minus(paid), new Prisma.Decimal(0));
    return {
      id: intent.id,
      orderId: intent.orderId,
      orderNumber: intent.order.orderNumber,
      status: intent.status,
      amountDue: intent.amountDue.toString(),
      paidAmount: paid.toString(),
      remainingAmount: remaining.toString(),
      currency: intent.currency,
      expiresAt: intent.expiresAt,
      paidAt: intent.paidAt,
      refundedAmount: intent.refundedAmount.toString(),
      instructions: this.snapshotOf(intent.providerSnapshot),
      submissions: intent.submissions.map((submission) => ({
        id: submission.id,
        provider: submission.provider,
        trxId: submission.trxId,
        senderNumber: submission.senderNumber,
        proofUrl: submission.proofUrl,
        status: submission.status,
        amountReceived: submission.amountReceived?.toString() ?? null,
        rejectReason: submission.rejectReason,
        reviewedAt: submission.reviewedAt,
        createdAt: submission.createdAt,
      })),
    };
  }

  async submit(customerId: string, orderId: string, dto: CreatePaymentSubmissionDto) {
    const intent = await this.prisma.paymentIntent.findFirst({
      where: { orderId, order: { customerId } },
      include: { submissions: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    if (!intent) throw AppException.notFound(ErrorCode.PAYMENT_NOT_FOUND, "Payment not found");
    if (intent.status === "PAID" || intent.status === "REFUNDED" || intent.status === "PARTIALLY_REFUNDED") {
      throw AppException.conflict(ErrorCode.PAYMENT_ALREADY_PAID, "This order is already paid");
    }
    const snapshot = this.snapshotOf(intent.providerSnapshot);
    if (!snapshot.providers.some((provider) => provider.provider === dto.provider)) {
      throw AppException.badRequest(ErrorCode.PAYMENT_INVALID_STATE, "This provider is not available for this payment");
    }
    if (intent.status === "EXPIRED") {
      const graceEnd = new Date(intent.expiresAt.getTime() + snapshot.lateGraceHours * 3_600_000);
      if (Date.now() > graceEnd.getTime()) {
        throw AppException.badRequest(ErrorCode.PAYMENT_EXPIRED, "The payment window has closed");
      }
    }
    if (intent.submissions.length >= MAX_SUBMISSIONS_PER_HOUR) {
      throw AppException.badRequest(ErrorCode.TOO_MANY_REQUESTS, "Too many payment submissions");
    }

    const trxId = dto.trxId.trim().toUpperCase();
    const existing = await this.prisma.paymentSubmission.findUnique({
      where: { provider_trxId: { provider: dto.provider, trxId } },
    });
    if (existing) {
      if (existing.intentId === intent.id && existing.status === "PENDING") {
        return { id: existing.id, status: existing.status, idempotent: true };
      }
      throw AppException.conflict(
        ErrorCode.PAYMENT_SUBMISSION_DUPLICATE,
        "This transaction ID has already been submitted",
      );
    }

    let submission;
    const proofUrl = await this.resolveProofUrl(customerId, dto.proofUrl);
    try {
      submission = await this.prisma.$transaction(async (tx) => {
        await this.lockIntent(tx, intent.id);
        const created = await tx.paymentSubmission.create({
          data: {
            intentId: intent.id,
            provider: dto.provider,
            trxId,
            senderNumber: dto.senderNumber.replace(/^\+?88/, ""),
            proofUrl,
          },
        });
        await tx.paymentIntent.update({
          where: { id: intent.id },
          data: { status: "PENDING_VERIFICATION" },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw AppException.conflict(
          ErrorCode.PAYMENT_SUBMISSION_DUPLICATE,
          "This transaction ID has already been submitted",
        );
      }
      throw error;
    }
    await this.notifyAdmins("Payment submitted", `A ${dto.provider} payment was submitted for order ${orderId}.`, {
      intentId: intent.id,
      orderId,
    });
    await this.audit.record({
      actorId: customerId,
      actorRole: "CUSTOMER",
      action: "payment.submitted",
      entityType: "PaymentIntent",
      entityId: intent.id,
      after: { provider: dto.provider, trxId },
    });
    return { id: submission.id, status: submission.status, idempotent: false };
  }

  async listAdmin(filter?: string) {
    const now = new Date();
    const rows = await this.prisma.paymentIntent.findMany({
      where:
        filter === "sla"
          ? { status: "PENDING_VERIFICATION" }
          : filter === "pending"
            ? { status: { in: ["UNPAID", "PENDING_VERIFICATION", "REJECTED"] } }
            : {},
      include: {
        order: {
          select: {
            orderNumber: true,
            customerId: true,
            contactPhone: true,
            customer: { select: { name: true } },
          },
        },
        submissions: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      orderNumber: row.order.orderNumber,
      status: row.status,
      amountDue: row.amountDue.toString(),
      refundedAmount: row.refundedAmount.toString(),
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      slaAlertedAt: row.slaAlertedAt,
      buyer: { id: row.order.customerId, name: row.order.customer?.name ?? "" },
      contactPhone: row.order.contactPhone,
      underSla:
        row.status === "PENDING_VERIFICATION" &&
        row.submissions[0] != null &&
        now.getTime() - row.submissions[0].createdAt.getTime() >
          this.snapshotOf(row.providerSnapshot).slaHours * 3_600_000,
      submissions: row.submissions.map((submission) => ({
        id: submission.id,
        provider: submission.provider,
        trxId: submission.trxId,
        senderNumber: submission.senderNumber,
        proofUrl: submission.proofUrl,
        status: submission.status,
        amountReceived: submission.amountReceived?.toString() ?? null,
        rejectReason: submission.rejectReason,
        reviewedAt: submission.reviewedAt,
        createdAt: submission.createdAt,
      })),
    }));
  }

  async verify(
    intentId: string,
    amountReceived: number,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockIntent(tx, intentId);
      const intent = await tx.paymentIntent.findUniqueOrThrow({
        where: { id: intentId },
        include: {
          submissions: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 },
          order: { include: { shopOrders: { include: { items: true } } } },
        },
      });
      if (intent.status !== "PENDING_VERIFICATION") {
        throw AppException.badRequest(ErrorCode.PAYMENT_INVALID_STATE, "Payment is not awaiting verification");
      }
      const submission = intent.submissions[0];
      if (!submission) {
        throw AppException.badRequest(ErrorCode.PAYMENT_INVALID_STATE, "No pending submission to verify");
      }
      const received = new Prisma.Decimal(amountReceived);
      const all = await tx.paymentSubmission.findMany({ where: { intentId } });
      const paidBefore = this.submissionTotals(all);
      const totalAfter = paidBefore.plus(received);

      if (totalAfter.lt(intent.amountDue)) {
        await tx.paymentSubmission.update({
          where: { id: submission.id },
          data: {
            status: "REJECTED",
            amountReceived: received,
            reviewedById: actor.id,
            reviewedAt: new Date(),
            rejectReason: `Underpaid; remaining ${intent.amountDue.minus(totalAfter).toString()}`,
          },
        });
        await tx.paymentIntent.update({ where: { id: intentId }, data: { status: "REJECTED" } });
        return {
          status: "UNDERPAID",
          remainingAmount: intent.amountDue.minus(totalAfter).toString(),
        };
      }

      await tx.paymentSubmission.update({
        where: { id: submission.id },
        data: {
          status: "VERIFIED",
          amountReceived: received,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });

      let reinstated = false;
      if (intent.order.shopOrders.some((shopOrder) => shopOrder.status === "CANCELLED")) {
        try {
          for (const shopOrder of intent.order.shopOrders) {
            if (shopOrder.status !== "CANCELLED" || shopOrder.kind === "REPLACEMENT") continue;
            for (const item of shopOrder.items) {
              if (!item.variantId) continue;
              const updated = await tx.productVariant.updateMany({
                where: { id: item.variantId, stockQty: { gte: item.quantity } },
                data: { stockQty: { decrement: item.quantity } },
              });
              if (updated.count === 0) throw new Error("STOCK_MISSING");
            }
          }
          for (const shopOrder of intent.order.shopOrders) {
            if (shopOrder.status !== "CANCELLED") continue;
            await tx.shopOrder.update({
              where: { id: shopOrder.id },
              data: { status: "PENDING", cancelledAt: null, cancelledBy: null, cancelReason: null },
            });
            await tx.orderStatusHistory.create({
              data: { shopOrderId: shopOrder.id, fromStatus: "CANCELLED", toStatus: "PENDING", note: "Reinstated after late payment" },
            });
          }
          reinstated = true;
        } catch {
          const obligation = await tx.refundObligation.create({
            data: {
              intentId,
              amount: intent.amountDue,
              status: "REFUND_REQUIRED",
              reason: "Late payment could not be reinstated because stock is unavailable",
            },
          });
          await tx.paymentIntent.update({
            where: { id: intentId },
            data: { status: "PAID", paidAt: new Date() },
          });
          await tx.order.update({ where: { id: intent.orderId }, data: { paymentStatus: "PAID" } });
          await this.ledger.postPaymentReceipt(tx, {
            intentId,
            orderId: intent.orderId,
            amount: totalAfter,
            createdById: actor.id,
          });
          return {
            status: "PAID_REFUND_REQUIRED",
            remainingAmount: "0",
            refundObligationId: obligation.id,
          };
        }
      }

      const excess = totalAfter.minus(intent.amountDue);
      if (excess.gt(0)) {
        await tx.refundObligation.create({
          data: {
            intentId,
            amount: excess,
            status: "REFUND_PAYABLE",
            reason: "Overpayment",
          },
        });
      }
      await tx.paymentIntent.update({
        where: { id: intentId },
        data: { status: "PAID", paidAt: new Date(), slaAlertedAt: null },
      });
      await tx.order.update({ where: { id: intent.orderId }, data: { paymentStatus: "PAID" } });
      await this.ledger.postPaymentReceipt(tx, {
        intentId,
        orderId: intent.orderId,
        amount: totalAfter,
        createdById: actor.id,
      });
      return {
        status: "PAID",
        remainingAmount: "0",
        overpaidAmount: excess.gt(0) ? excess.toString() : "0",
        reinstated,
      };
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "payment.verified",
      entityType: "PaymentIntent",
      entityId: intentId,
      after: result,
      ...meta,
    });
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (intent) {
      await this.notifications.create({
        userId: intent.orderId ? (await this.prisma.order.findUniqueOrThrow({ where: { id: intent.orderId }, select: { customerId: true } })).customerId : "",
        type: "ORDER_STATUS_CHANGED",
        title: result.status === "UNDERPAID" ? "Payment underpaid" : "Payment verified",
        body:
          result.status === "UNDERPAID"
            ? `Remaining amount: ${result.remainingAmount}. Submit another transaction ID.`
            : "Your advance payment has been verified.",
        data: { intentId, orderId: intent.orderId, status: result.status },
      });
    }
    return result;
  }

  async reject(intentId: string, reason: string, actor: AuthenticatedUser, meta: RequestMeta) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockIntent(tx, intentId);
      const intent = await tx.paymentIntent.findUniqueOrThrow({
        where: { id: intentId },
        include: { submissions: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (intent.status !== "PENDING_VERIFICATION" || !intent.submissions[0]) {
        throw AppException.badRequest(ErrorCode.PAYMENT_INVALID_STATE, "No pending submission to reject");
      }
      await tx.paymentSubmission.update({
        where: { id: intent.submissions[0].id },
        data: { status: "REJECTED", reviewedById: actor.id, reviewedAt: new Date(), rejectReason: reason },
      });
      await tx.paymentIntent.update({ where: { id: intentId }, data: { status: "REJECTED" } });
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "payment.rejected",
      entityType: "PaymentIntent",
      entityId: intentId,
      after: { reason },
      ...meta,
    });
    const rejected = await this.prisma.paymentIntent.findUnique({
      where: { id: intentId },
      select: { orderId: true, order: { select: { customerId: true } } },
    });
    if (rejected) {
      await this.notifications.create({
        userId: rejected.order.customerId,
        type: "ORDER_STATUS_CHANGED",
        title: "Payment rejected",
        body: reason,
        data: { intentId, orderId: rejected.orderId, status: "REJECTED" },
      });
    }
  }

  async refundQueue() {
    return this.prisma.refundObligation.findMany({
      where: { status: { in: ["REFUND_REQUIRED", "REFUND_PAYABLE"] } },
      include: {
        intent: {
          select: {
            orderId: true,
            amountDue: true,
            order: {
              select: {
                orderNumber: true,
                customerId: true,
                customer: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async completeRefund(id: string, refundTrxId: string, actor: AuthenticatedUser, meta: RequestMeta) {
    const result = await this.prisma.$transaction(async (tx) => {
      const obligation = await tx.refundObligation.findUnique({ where: { id } });
      if (!obligation) throw AppException.notFound(ErrorCode.NOT_FOUND, "Refund obligation not found");
      if (obligation.status === "COMPLETED") return obligation;
      await this.lockIntent(tx, obligation.intentId);
      await tx.refundObligation.update({
        where: { id },
        data: { status: "COMPLETED", refundTrxId, completedById: actor.id, completedAt: new Date() },
      });
      const intent = await tx.paymentIntent.update({
        where: { id: obligation.intentId },
        data: { refundedAmount: { increment: obligation.amount } },
      });
      await this.ledger.postBatch(tx, `refund_obligation_paid:${id}`, [
        {
          account: "PLATFORM_HOLDINGS",
          amount: obligation.amount.negated(),
          type: "REFUND_PAID",
          orderId: intent.orderId,
          refundId: null,
          description: `Manual refund ${refundTrxId} paid from platform holdings`,
          createdById: actor.id,
        },
        {
          account: "REFUNDS_PAID",
          amount: obligation.amount,
          type: "REFUND_PAID",
          orderId: intent.orderId,
          description: `Manual refund ${refundTrxId} paid to buyer`,
          createdById: actor.id,
        },
      ]);
      const status = intent.refundedAmount.gte(intent.amountDue) ? "REFUNDED" : "PARTIALLY_REFUNDED";
      return tx.paymentIntent.update({ where: { id: intent.id }, data: { status } });
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "payment.refund_completed",
      entityType: "RefundObligation",
      entityId: id,
      after: { refundTrxId },
      ...meta,
    });
    return result;
  }

  async createCancellationRefund(
    tx: Prisma.TransactionClient,
    shopOrderId: string,
    reason: string,
  ) {
    const allocation = await tx.paymentIntentAllocation.findUnique({
      where: { shopOrderId },
      include: { intent: true },
    });
    if (!allocation || allocation.intent.status === "REFUNDED") return;
    const existing = await tx.refundObligation.findFirst({
      where: { intentId: allocation.intentId, shopOrderId },
    });
    if (existing) return;
    await tx.refundObligation.create({
      data: {
        intentId: allocation.intentId,
        shopOrderId,
        amount: allocation.amount,
        status: "REFUND_REQUIRED",
        reason,
      },
    });
  }

  async sellerStatus(sellerUserId: string, shopOrderId: string) {
    const shopOrder = await this.prisma.shopOrder.findFirst({
      where: { id: shopOrderId, shop: { sellerProfile: { userId: sellerUserId } } },
      select: { id: true, orderId: true, total: true },
    });
    if (!shopOrder) throw AppException.notFound(ErrorCode.ORDER_NOT_FOUND, "Order not found");
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { orderId: shopOrder.orderId },
      select: { status: true, amountDue: true, paidAt: true, refundedAmount: true },
    });
    return {
      shopOrderId,
      paymentMethod: intent ? "ADVANCE" : "COD",
      status: intent?.status ?? "COD",
      amountDue: intent?.amountDue.toString() ?? null,
      paidAt: intent?.paidAt ?? null,
      refundedAmount: intent?.refundedAmount.toString() ?? "0",
    };
  }

  async expireUnpaid(): Promise<number> {
    const now = new Date();
    const intents = await this.prisma.paymentIntent.findMany({
      where: { status: "UNPAID", expiresAt: { lte: now } },
      select: { id: true },
      take: 100,
    });
    let expired = 0;
    for (const candidate of intents) {
      const changed = await this.prisma.$transaction(async (tx) => {
        await this.lockIntent(tx, candidate.id);
        const intent = await tx.paymentIntent.findUniqueOrThrow({
          where: { id: candidate.id },
          include: { order: { include: { shopOrders: { include: { items: true } } } } },
        });
        if (intent.status !== "UNPAID" || intent.expiresAt > now) return false;
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "EXPIRED" } });
        await tx.order.update({ where: { id: intent.orderId }, data: { paymentStatus: "CANCELLED" } });
        for (const shopOrder of intent.order.shopOrders) {
          if (shopOrder.status === "CANCELLED" || shopOrder.kind === "REPLACEMENT") continue;
          await tx.shopOrder.update({
            where: { id: shopOrder.id },
            data: { status: "CANCELLED", cancelledAt: now, cancelledBy: "SYSTEM", cancelReason: "Advance payment expired" },
          });
          await tx.orderStatusHistory.create({
            data: { shopOrderId: shopOrder.id, fromStatus: shopOrder.status, toStatus: "CANCELLED", note: "Advance payment expired" },
          });
          for (const item of shopOrder.items) {
            if (!item.variantId) continue;
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { stockQty: { increment: item.quantity } },
            });
            await tx.inventoryLog.create({
              data: {
                variantId: item.variantId,
                delta: item.quantity,
                stockAfter: (await tx.productVariant.findUniqueOrThrow({ where: { id: item.variantId }, select: { stockQty: true } })).stockQty,
                reason: "ORDER_CANCELLED",
                referenceType: "Order",
                referenceId: intent.orderId,
              },
            });
          }
        }
        return true;
      });
      if (changed) {
        expired += 1;
        await this.notifications.create({
          userId: (await this.prisma.order.findUniqueOrThrow({ where: { id: (await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id: candidate.id }, select: { orderId: true } })).orderId }, select: { customerId: true } })).customerId,
          type: "ORDER_CANCELLED",
          title: "Payment expired",
          body: "Your advance payment expired and the order was cancelled. Stock was released.",
        });
      }
    }
    return expired;
  }

  async alertSla(): Promise<number> {
    const now = new Date();
    const intents = await this.prisma.paymentIntent.findMany({
      where: { status: "PENDING_VERIFICATION", slaAlertedAt: null },
      include: { submissions: { orderBy: { createdAt: "asc" }, take: 1 }, order: { select: { orderNumber: true } } },
      take: 100,
    });
    let alerted = 0;
    for (const intent of intents) {
      const snapshot = this.snapshotOf(intent.providerSnapshot);
      const submittedAt = intent.submissions[0]?.createdAt;
      if (!submittedAt || now.getTime() - submittedAt.getTime() < snapshot.slaHours * 3_600_000) continue;
      const updated = await this.prisma.paymentIntent.updateMany({
        where: { id: intent.id, slaAlertedAt: null },
        data: { slaAlertedAt: now },
      });
      if (updated.count === 0) continue;
      alerted += 1;
      await this.notifyAdmins(
        "Payment verification overdue",
        `Advance payment for ${intent.order.orderNumber} has waited longer than the ${snapshot.slaHours}h SLA.`,
        { intentId: intent.id },
      );
      await this.notifications.create({
        userId: (await this.prisma.order.findUniqueOrThrow({ where: { id: intent.orderId }, select: { customerId: true } })).customerId,
        type: "ORDER_STATUS_CHANGED",
        title: "Payment still under review",
        body: "We are still verifying your advance payment. Your stock remains reserved.",
        data: { intentId: intent.id },
      });
    }
    return alerted;
  }

  private async notifyAdmins(title: string, body: string, data: unknown) {
    await this.notifications.createForAdmins({ type: "ANNOUNCEMENT", title, body, data });
  }
}
