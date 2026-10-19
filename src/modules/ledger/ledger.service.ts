import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import { money } from "../../common/utils/money";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import type { LedgerEntryType } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
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

export interface SellerBalances {
  /** Held positive entries (not yet unlocked by the hold window / open complaint). */
  pending: Prisma.Decimal;
  /** Payout-able amount (unlocked positive entries minus all negative entries). */
  available: Prisma.Decimal;
  /** Positive amount the seller owes the platform (commission/payouts). */
  owedToPlatform: Prisma.Decimal;
  /** pending + available (total ledger sum). */
  net: Prisma.Decimal;
}

const OPEN_COMPLAINT_STATUSES = ["OPEN", "SELLER_RESPONDED", "UNDER_REVIEW"] as const;

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async record(
    client: Prisma.TransactionClient | PrismaClient,
    input: LedgerRecordInput,
  ): Promise<void> {
    // Negative entries are effective immediately. Positive entries unlock after
    // `payout.holdHours` past the shop order's delivery (or creation for credits).
    let availableAt: Date | null = null;
    if (input.amount.gt(0)) {
      const holdHours = await this.settings.getNumber("payout.holdHours");
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
      availableAt = new Date(base.getTime() + holdHours * 60 * 60 * 1000);
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
   * Reverse a refund exactly once. COD: the seller collected cash and owes
   * commission, so credit the commission back. Online: debit the seller share.
   * Safe to call from both complaint resolution and refund processing.
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
      select: { amount: true, availableAt: true, shopOrderId: true },
    });

    const now = new Date();
    const positiveShopOrderIds = [
      ...new Set(
        entries
          .filter((entry) => entry.amount.gt(0) && entry.shopOrderId)
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
    for (const entry of entries) {
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

    const available = money(positive.minus(held).minus(negative));
    return {
      pending: money(held),
      available,
      owedToPlatform: available.lt(0) ? money(available.abs()) : new Prisma.Decimal(0),
      net: money(positive.minus(negative)),
    };
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
}
