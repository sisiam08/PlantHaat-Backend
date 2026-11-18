import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import { money } from "../../common/utils/money";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import type { LedgerAccount, LedgerEntryType } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SettingsService } from "../settings/settings.service";
import type { QueryLedgerDto } from "./dto/query-ledger.dto";

export interface LedgerRecordInput {
  sellerProfileId: string;
  shopOrderId?: string | null;
  payoutId?: string | null;
  refundId?: string | null;
  type: LedgerEntryType;
  amount: Prisma.Decimal;
  description?: string | null;
  createdById?: string | null;
}

export interface PostingEntry {
  account: LedgerAccount;
  amount: Prisma.Decimal;
  sellerProfileId?: string | null;
  type: LedgerEntryType;
  shopOrderId?: string | null;
  orderId?: string | null;
  paymentId?: string | null;
  payoutId?: string | null;
  refundId?: string | null;
  disputeId?: string | null;
  withdrawalId?: string | null;
  releaseAt?: Date | null;
  description?: string | null;
  createdById?: string | null;
}

export interface SellerBalances {
  /** Held positive entries (not yet unlocked by the hold window / open complaint). */
  pending: Prisma.Decimal;
  /** Payout-able amount (unlocked positive entries minus all negative entries). */
  available: Prisma.Decimal;
  /** Positive amount the seller owes the platform (commission/payouts). */
  owedToPlatform: Prisma.Decimal;
  /** pending + available (total ledger sum). */
  net: Prisma.Decimal;
  /** Part 4 buckets (account ledger). */
  onHold: Prisma.Decimal;
  withdrawalReserved: Prisma.Decimal;
  totalWithdrawn: Prisma.Decimal;
  codDues: Prisma.Decimal;
}

const OPEN_COMPLAINT_STATUSES = ["OPEN", "SELLER_RESPONDED", "UNDER_REVIEW"] as const;
const HOUR = 3_600_000;

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Single source of truth for the money hold; payout.holdHours is an alias. */
  async releaseWindowHours(): Promise<number> {
    return this.settings.getNumber("return.windowHours");
  }

  async releaseAtFor(deliveredAt: Date): Promise<Date> {
    return new Date(deliveredAt.getTime() + (await this.releaseWindowHours()) * HOUR);
  }

  async record(
    client: Prisma.TransactionClient | PrismaClient,
    input: LedgerRecordInput,
  ): Promise<void> {
    // Legacy single-sided seller ledger, kept for pre-Part-4 rows/adapters.
    // New settlement code must use postBatch() with explicit accounts.
    let availableAt: Date | null = null;
    if (input.amount.gt(0)) {
      const holdHours = await this.releaseWindowHours();
      let base = new Date();
      if (input.shopOrderId) {
        const shopOrder = await client.shopOrder.findUnique({
          where: { id: input.shopOrderId },
          select: { deliveredAt: true },
        });
        if (shopOrder?.deliveredAt) {
          base = shopOrder.deliveredAt;
        }
      }
      availableAt = new Date(base.getTime() + holdHours * HOUR);
    }

    await client.ledgerEntry.create({
      data: {
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId ?? null,
        payoutId: input.payoutId ?? null,
        refundId: input.refundId ?? null,
        type: input.type,
        amount: input.amount,
        description: input.description ?? null,
        createdById: input.createdById ?? null,
        availableAt,
      },
    });
  }

  /**
   * Append-only balanced batch. Every business event calls this once with a
   * deterministic eventKey; each row gets `${eventKey}:${index}` so a replay is
   * a no-op (unique idempotencyKey, skipDuplicates).
   */
  async postBatch(
    client: Prisma.TransactionClient | PrismaClient,
    eventKey: string,
    entries: PostingEntry[],
  ): Promise<number> {
    if (entries.length === 0) return 0;
    const batchId = eventKey;
    const data = entries.map((entry, index) => ({
      sellerProfileId: entry.sellerProfileId ?? null,
      shopOrderId: entry.shopOrderId ?? null,
      orderId: entry.orderId ?? null,
      paymentId: entry.paymentId ?? null,
      payoutId: entry.payoutId ?? null,
      refundId: entry.refundId ?? null,
      disputeId: entry.disputeId ?? null,
      withdrawalId: entry.withdrawalId ?? null,
      type: entry.type,
      account: entry.account,
      amount: entry.amount,
      description: entry.description ?? null,
      createdById: entry.createdById ?? null,
      releaseAt: entry.releaseAt ?? null,
      batchId,
      idempotencyKey: `${eventKey}:${index}`,
    }));
    const result = await client.ledgerEntry.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  async postPaymentReceipt(
    client: Prisma.TransactionClient | PrismaClient,
    input: {
      intentId: string;
      orderId: string;
      paymentId?: string | null;
      amount: Prisma.Decimal;
      createdById?: string | null;
    },
  ): Promise<void> {
    if (input.amount.lte(0)) return;
    await this.postBatch(client, `payment_receipt:${input.intentId}`, [
      {
        account: "BUYER_RECEIPTS",
        amount: input.amount,
        type: "PAYMENT_RECEIVED",
        orderId: input.orderId,
        paymentId: input.paymentId ?? null,
        description: "Advance payment received by platform",
        createdById: input.createdById ?? null,
      },
      {
        account: "PLATFORM_HOLDINGS",
        amount: input.amount,
        type: "PAYMENT_RECEIVED",
        orderId: input.orderId,
        paymentId: input.paymentId ?? null,
        description: "Advance payment held by platform",
        createdById: input.createdById ?? null,
      },
    ]);
  }

  /** Payment PAID -> seller PENDING + platform commission; funds leave holdings. */
  async postAdvanceDelivery(
    client: Prisma.TransactionClient | PrismaClient,
    input: {
      shopOrderId: string;
      orderId: string;
      sellerProfileId: string;
      total: Prisma.Decimal;
      commission: Prisma.Decimal;
      net: Prisma.Decimal;
      releaseAt: Date;
      createdById?: string | null;
    },
  ): Promise<number> {
    return this.postBatch(client, `delivery:${input.shopOrderId}`, [
      {
        account: "PLATFORM_HOLDINGS",
        amount: input.total.negated(),
        type: "SELLER_PENDING",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId,
        orderId: input.orderId,
        releaseAt: input.releaseAt,
        description: "Funds leave platform holdings on delivery",
        createdById: input.createdById ?? null,
      },
      {
        account: "SELLER_PENDING",
        amount: input.net,
        type: "SELLER_PENDING",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId,
        orderId: input.orderId,
        releaseAt: input.releaseAt,
        description: "Seller net pending return window",
        createdById: input.createdById ?? null,
      },
      {
        account: "PLATFORM_COMMISSION",
        amount: input.commission,
        type: "COMMISSION",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId,
        orderId: input.orderId,
        description: "Platform commission on delivered order",
        createdById: input.createdById ?? null,
      },
    ]);
  }

  /** COD: commission is a receivable; the platform never receives the cash. */
  async postCodDues(
    client: Prisma.TransactionClient | PrismaClient,
    input: {
      shopOrderId: string;
      orderId: string;
      sellerProfileId: string;
      commission: Prisma.Decimal;
      createdById?: string | null;
    },
  ): Promise<void> {
    if (input.commission.lte(0)) return;
    await this.postBatch(client, `cod_dues:${input.shopOrderId}`, [
      {
        account: "COD_DUES",
        amount: input.commission.negated(),
        type: "COD_DUES_ACCRUAL",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId,
        orderId: input.orderId,
        description: "COD commission due to platform",
        createdById: input.createdById ?? null,
      },
    ]);
    if (!(await this.settings.getBoolean("wallet.codCommissionDeduct"))) return;
    await this.settleCodDuesFromAvailable(client, {
      sellerProfileId: input.sellerProfileId,
      shopOrderId: input.shopOrderId,
      maxAmount: input.commission,
      createdById: input.createdById ?? null,
    });
  }

  /** Move AVAILABLE -> platform commission + clear COD dues (idempotent). */
  async settleCodDuesFromAvailable(
    client: Prisma.TransactionClient | PrismaClient,
    input: {
      sellerProfileId: string;
      shopOrderId?: string | null;
      maxAmount?: Prisma.Decimal;
      createdById?: string | null;
    },
  ): Promise<Prisma.Decimal> {
    const available = await this.accountSum(client, input.sellerProfileId, "SELLER_AVAILABLE");
    const dues = (await this.accountSum(client, input.sellerProfileId, "COD_DUES")).negated();
    const cap = input.maxAmount ?? dues;
    const amount = Prisma.Decimal.min(Prisma.Decimal.min(available, dues), cap);
    if (amount.lte(0)) return new Prisma.Decimal(0);
    const key = `cod_deduct:${input.sellerProfileId}:${input.shopOrderId ?? "manual"}:${dues.toFixed(2)}:${available.toFixed(2)}`;
    await this.postBatch(client, key, [
      {
        account: "SELLER_AVAILABLE",
        amount: amount.negated(),
        type: "COD_DUES_PAYMENT",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId ?? null,
        description: "COD commission deducted from available balance",
        createdById: input.createdById ?? null,
      },
      {
        account: "PLATFORM_COMMISSION",
        amount,
        type: "COMMISSION",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId ?? null,
        description: "COD commission retained from seller balance",
        createdById: input.createdById ?? null,
      },
      {
        account: "COD_DUES",
        amount,
        type: "COD_DUES_PAYMENT",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId ?? null,
        description: "COD dues reduced by deduction",
        createdById: input.createdById ?? null,
      },
    ]);
    return amount;
  }

  async holdForDispute(
    client: Prisma.TransactionClient | PrismaClient,
    input: {
      disputeId: string;
      shopOrderId: string;
      sellerProfileId: string;
      createdById?: string | null;
    },
  ): Promise<Prisma.Decimal> {
    const pending = await this.accountSum(
      client,
      input.sellerProfileId,
      "SELLER_PENDING",
      input.shopOrderId,
    );
    const available = await this.accountSum(
      client,
      input.sellerProfileId,
      "SELLER_AVAILABLE",
      input.shopOrderId,
    );
    const fromPending = Prisma.Decimal.min(pending, available.plus(pending));
    const amount = pending.gt(0) ? fromPending : available;
    if (amount.lte(0)) return new Prisma.Decimal(0);
    await this.postBatch(client, `dispute_hold:${input.disputeId}`, [
      {
        account: pending.gt(0) ? "SELLER_PENDING" : "SELLER_AVAILABLE",
        amount: amount.negated(),
        type: "DISPUTE_HOLD",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId,
        disputeId: input.disputeId,
        description: "Seller funds held for an open dispute",
        createdById: input.createdById ?? null,
      },
      {
        account: "SELLER_ON_HOLD",
        amount,
        type: "DISPUTE_HOLD",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId,
        disputeId: input.disputeId,
        description: "Funds on hold pending dispute decision",
        createdById: input.createdById ?? null,
      },
    ]);
    return amount;
  }

  async releaseDisputeHold(
    client: Prisma.TransactionClient | PrismaClient,
    input: {
      disputeId: string;
      shopOrderId: string;
      sellerProfileId: string;
      amount: Prisma.Decimal;
      to: "SELLER_PENDING" | "SELLER_AVAILABLE";
      releaseAt?: Date | null;
      createdById?: string | null;
    },
  ): Promise<void> {
    if (input.amount.lte(0)) return;
    await this.postBatch(client, `dispute_release:${input.disputeId}:${input.to}`, [
      {
        account: "SELLER_ON_HOLD",
        amount: input.amount.negated(),
        type: "DISPUTE_RELEASE",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId,
        disputeId: input.disputeId,
        description: "Dispute hold released",
        createdById: input.createdById ?? null,
      },
      {
        account: input.to,
        amount: input.amount,
        type: "DISPUTE_RELEASE",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId,
        disputeId: input.disputeId,
        releaseAt: input.releaseAt ?? null,
        description: "Dispute hold released to seller",
        createdById: input.createdById ?? null,
      },
    ]);
  }

  /**
   * Refund obligation from held/pending seller funds plus proportional
   * commission reversal. `amount` must be <= held + remaining commission.
   */
  async postRefundObligation(
    client: Prisma.TransactionClient | PrismaClient,
    input: {
      refundId: string;
      shopOrderId: string;
      sellerProfileId: string;
      amount: Prisma.Decimal;
      refundableSellerFunds: Prisma.Decimal;
      commissionRemaining: Prisma.Decimal;
      source: "SELLER_ON_HOLD" | "SELLER_PENDING" | "SELLER_AVAILABLE";
      createdById?: string | null;
    },
  ): Promise<void> {
    if (input.amount.lte(0)) return;
    const fromSeller = Prisma.Decimal.min(input.amount, input.refundableSellerFunds);
    const fromCommission = Prisma.Decimal.min(
      input.amount.minus(fromSeller),
      input.commissionRemaining,
    );
    const entries: PostingEntry[] = [
      {
        account: "REFUND_PAYABLE",
        amount: input.amount,
        type: "REFUND_PAYABLE_CREATED",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId,
        refundId: input.refundId,
        description: "Refund payable to buyer",
        createdById: input.createdById ?? null,
      },
    ];
    if (fromSeller.gt(0)) {
      entries.push({
        account: input.source,
        amount: fromSeller.negated(),
        type: "REFUND_PAYABLE_CREATED",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId,
        refundId: input.refundId,
        description: "Seller funds allocated to buyer refund",
        createdById: input.createdById ?? null,
      });
    }
    if (fromCommission.gt(0)) {
      entries.push({
        account: "PLATFORM_COMMISSION",
        amount: fromCommission.negated(),
        type: "REFUND_PAYABLE_CREATED",
        sellerProfileId: input.sellerProfileId,
        shopOrderId: input.shopOrderId,
        refundId: input.refundId,
        description: "Platform commission reversed for buyer refund",
        createdById: input.createdById ?? null,
      });
    }
    await this.postBatch(client, `refund_payable:${input.refundId}`, entries);
  }

  async postRefundPaid(
    client: Prisma.TransactionClient | PrismaClient,
    input: { refundId: string; amount: Prisma.Decimal; createdById?: string | null },
  ): Promise<void> {
    if (input.amount.lte(0)) return;
    await this.postBatch(client, `refund_paid:${input.refundId}`, [
      {
        account: "REFUND_PAYABLE",
        amount: input.amount.negated(),
        type: "REFUND_PAID",
        refundId: input.refundId,
        description: "Refund obligation settled",
        createdById: input.createdById ?? null,
      },
      {
        account: "REFUNDS_PAID",
        amount: input.amount,
        type: "REFUND_PAID",
        refundId: input.refundId,
        description: "Refund paid to buyer",
        createdById: input.createdById ?? null,
      },
    ]);
  }

  /**
   * Reverse a refund exactly once for the legacy ledger projection.
   * COD: the seller collected cash and owes commission, so credit it back.
   */
  async reverseRefund(
    client: Prisma.TransactionClient | PrismaClient,
    input: {
      refundId: string;
      sellerProfileId: string;
      shopOrderId: string;
      commissionAmount: Prisma.Decimal;
      paymentMethod: string;
      createdById?: string | null;
    },
  ): Promise<boolean> {
    const existing = await client.ledgerEntry.findFirst({
      where: { refundId: input.refundId },
      select: { id: true },
    });
    if (existing) {
      return false;
    }
    const isCod = input.paymentMethod === "COD";
    await this.record(client, {
      sellerProfileId: input.sellerProfileId,
      shopOrderId: input.shopOrderId,
      refundId: input.refundId,
      type: "REFUND_REVERSAL",
      amount: isCod ? input.commissionAmount : input.commissionAmount.negated(),
      description: isCod
        ? "Refund: commission reversed (COD)"
        : "Refund: seller share reversed (online)",
      createdById: input.createdById ?? null,
    });
    return true;
  }

  /** Total ledger sum (pending + available). */
  async balance(sellerProfileId: string): Promise<Prisma.Decimal> {
    return (await this.balances(sellerProfileId)).net;
  }

  async balances(sellerProfileId: string): Promise<SellerBalances> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { sellerProfileId },
      select: { amount: true, availableAt: true, shopOrderId: true, account: true },
    });

    const now = new Date();
    const positiveShopOrderIds = [
      ...new Set(
        entries
          .filter((entry) => entry.amount.gt(0) && entry.shopOrderId && !entry.account)
          .map((entry) => entry.shopOrderId as string),
      ),
    ];
    const openComplaints =
      positiveShopOrderIds.length > 0
        ? await this.prisma.complaint.findMany({
            where: {
              shopOrderId: { in: positiveShopOrderIds },
              status: { in: [...OPEN_COMPLAINT_STATUSES] },
            },
            select: { shopOrderId: true },
          })
        : [];
    const heldShopOrders = new Set(openComplaints.map((row) => row.shopOrderId));

    let positive = new Prisma.Decimal(0);
    let held = new Prisma.Decimal(0);
    let negative = new Prisma.Decimal(0);
    const accounts = new Map<string, Prisma.Decimal>();
    for (const entry of entries) {
      if (entry.account) {
        accounts.set(
          entry.account,
          (accounts.get(entry.account) ?? new Prisma.Decimal(0)).plus(entry.amount),
        );
        continue;
      }
      if (entry.amount.gt(0)) {
        positive = positive.plus(entry.amount);
        const heldByTime = entry.availableAt !== null && entry.availableAt > now;
        const heldByComplaint =
          entry.shopOrderId !== null && heldShopOrders.has(entry.shopOrderId);
        if (heldByTime || heldByComplaint) {
          held = held.plus(entry.amount);
        }
      } else {
        negative = negative.plus(entry.amount.abs());
      }
    }

    const account = (name: string) => accounts.get(name) ?? new Prisma.Decimal(0);
    const legacyAvailable = money(positive.minus(held).minus(negative));
    const pending = money(held.plus(account("SELLER_PENDING")));
    const available = money(legacyAvailable.plus(account("SELLER_AVAILABLE")));
    const onHold = money(account("SELLER_ON_HOLD"));
    const withdrawalReserved = money(account("SELLER_WITHDRAWAL_RESERVED"));
    const totalWithdrawn = money(account("SELLER_PAID_OUT"));
    const codDues = money(account("COD_DUES").negated());
    const net = money(
      positive
        .minus(negative)
        .plus(account("SELLER_PENDING"))
        .plus(account("SELLER_AVAILABLE"))
        .plus(account("SELLER_ON_HOLD"))
        .plus(account("SELLER_WITHDRAWAL_RESERVED"))
        .plus(account("COD_DUES")),
    );
    return {
      pending,
      available,
      owedToPlatform: available.lt(0) ? money(available.abs()) : new Prisma.Decimal(0),
      net,
      onHold,
      withdrawalReserved,
      totalWithdrawn,
      codDues,
    };
  }

  async accountSum(
    client: Prisma.TransactionClient | PrismaClient,
    sellerProfileId: string,
    account: LedgerAccount,
    shopOrderId?: string,
  ): Promise<Prisma.Decimal> {
    const row = await client.ledgerEntry.aggregate({
      where: {
        sellerProfileId,
        account,
        ...(shopOrderId ? { shopOrderId } : {}),
      },
      _sum: { amount: true },
    });
    return money(row._sum.amount ?? new Prisma.Decimal(0));
  }

  /** Pending buckets with per-order release dates for the seller wallet. */
  async pendingOrders(sellerProfileId: string) {
    const rows = await this.prisma.ledgerEntry.groupBy({
      by: ["shopOrderId"],
      where: { sellerProfileId, account: "SELLER_PENDING" },
      _sum: { amount: true },
      _max: { releaseAt: true },
    });
    return rows
      .filter((row) => row.shopOrderId && (row._sum.amount ?? new Prisma.Decimal(0)).gt(0))
      .map((row) => ({
        shopOrderId: row.shopOrderId as string,
        amount: money(row._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
        releaseAt: row._max.releaseAt?.toISOString() ?? null,
      }));
  }

  async list(sellerProfileId: string, query: QueryLedgerDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.LedgerEntryWhereInput = {
      sellerProfileId,
      ...(query.type ? { type: query.type } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  /**
   * Catch-up safe release. Locks the ShopOrder row; a concurrent dispute takes
   * the same lock (A9). Skips orders with an open dispute.
   */
  async releaseDue(now = new Date()): Promise<{ released: number }> {
    const due = await this.prisma.shopOrder.findMany({
      where: {
        status: "DELIVERED",
        fundsReleasedAt: null,
        releaseAt: { lte: now },
        order: { paymentMethod: "ADVANCE" },
        complaints: {
          none: { status: { in: [...OPEN_COMPLAINT_STATUSES] } },
        },
      },
      select: { id: true },
      take: 200,
    });
    let released = 0;
    for (const row of due) {
      const didRelease = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "ShopOrder" WHERE "id" = ${row.id} FOR UPDATE`;
        if (locked.length === 0) return false;
        const shopOrder = await tx.shopOrder.findUniqueOrThrow({
          where: { id: row.id },
          select: {
            id: true,
            orderId: true,
            shopOrderNumber: true,
            status: true,
            deliveredAt: true,
            releaseAt: true,
            fundsReleasedAt: true,
            order: { select: { paymentMethod: true } },
            shop: { select: { sellerProfileId: true, sellerProfile: { select: { userId: true } } } },
            complaints: {
              where: { status: { in: [...OPEN_COMPLAINT_STATUSES] } },
              select: { id: true },
            },
          },
        });
        if (
          shopOrder.order.paymentMethod !== "ADVANCE" ||
          shopOrder.fundsReleasedAt ||
          shopOrder.status !== "DELIVERED" ||
          shopOrder.complaints.length > 0 ||
          !shopOrder.releaseAt ||
          shopOrder.releaseAt > now
        ) {
          return false;
        }
        const pending = await this.accountSum(
          tx,
          shopOrder.shop.sellerProfileId,
          "SELLER_PENDING",
          shopOrder.id,
        );
        if (pending.lte(0)) return false;
        await this.postBatch(tx, `release:${shopOrder.id}`, [
          {
            account: "SELLER_PENDING",
            amount: pending.negated(),
            type: "SELLER_RELEASE",
            sellerProfileId: shopOrder.shop.sellerProfileId,
            shopOrderId: shopOrder.id,
            orderId: shopOrder.orderId,
            description: "Return window closed; funds released",
          },
          {
            account: "SELLER_AVAILABLE",
            amount: pending,
            type: "SELLER_RELEASE",
            sellerProfileId: shopOrder.shop.sellerProfileId,
            shopOrderId: shopOrder.id,
            orderId: shopOrder.orderId,
            description: "Seller funds available for withdrawal",
          },
        ]);
        await tx.shopOrder.update({
          where: { id: shopOrder.id },
          data: { fundsReleasedAt: now },
        });
        await this.notifications.create({
          userId: shopOrder.shop.sellerProfile.userId,
          type: "ORDER_STATUS_CHANGED",
          title: "Funds released",
          body: `Order ${shopOrder.shopOrderNumber} funds are now available for withdrawal.`,
          data: { shopOrderId: shopOrder.id, amount: pending.toFixed(2) },
        });
        return true;
      });
      if (didRelease) released += 1;
    }
    return { released };
  }

  /** A5 conservation invariant over the settlement ledger. */
  async reconcile() {
    const totals = await this.prisma.ledgerEntry.groupBy({
      by: ["account"],
      where: { account: { not: null } },
      _sum: { amount: true },
    });
    const value = (account: string) =>
      money(totals.find((row) => row.account === account)?._sum.amount ?? new Prisma.Decimal(0));
    const receipts = value("BUYER_RECEIPTS");
    const buckets = [
      "PLATFORM_HOLDINGS",
      "SELLER_PENDING",
      "SELLER_AVAILABLE",
      "SELLER_ON_HOLD",
      "SELLER_WITHDRAWAL_RESERVED",
      "REFUND_PAYABLE",
      "PLATFORM_COMMISSION",
      "SELLER_PAID_OUT",
      "REFUNDS_PAID",
    ].reduce((sum, account) => sum.plus(value(account)), new Prisma.Decimal(0));
    const difference = money(receipts.minus(buckets));
    const codDues = money(value("COD_DUES").negated());
    return {
      receipts: receipts.toFixed(2),
      buckets: money(buckets).toFixed(2),
      difference: difference.toFixed(2),
      balanced: difference.isZero(),
      codDues: codDues.toFixed(2),
      accounts: Object.fromEntries(totals.map((row) => [String(row.account), value(String(row.account))])),
    };
  }
}
