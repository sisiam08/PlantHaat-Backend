import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import { generatePayoutNumber } from "../../common/utils/order-number";
import type { RequestMeta } from "../../common/utils/request-meta";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { LedgerService } from "../ledger/ledger.service";
import type { QueryLedgerDto } from "../ledger/dto/query-ledger.dto";
import { SellerContextService } from "../sellers/seller-context.service";
import type {
  AdjustmentDto,
  CreatePayoutDto,
  DuesPaymentDto,
  QueryPayoutsDto,
  UpdatePayoutDto,
} from "./dto/payout.dto";

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly sellerContext: SellerContextService,
  ) {}

  async listPayouts(query: QueryPayoutsDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.PayoutWhereInput = query.status ? { status: query.status } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payout.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { sellerProfile: { select: { id: true, businessName: true } } },
      }),
      this.prisma.payout.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async createPayout(dto: CreatePayoutDto, actor: AuthenticatedUser, meta: RequestMeta) {
    await this.assertSeller(dto.sellerProfileId);
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw AppException.unprocessable(
        ErrorCode.PAYOUT_INVALID_AMOUNT,
        "Payout amount must be positive",
      );
    }
    // Only the unlocked (available) balance can be paid out.
    const balances = await this.ledger.balances(dto.sellerProfileId);
    if (amount.gt(balances.available)) {
      throw AppException.unprocessable(
        ErrorCode.PAYOUT_EXCEEDS_AVAILABLE,
        `Payout exceeds the available balance (${balances.available.toFixed(2)})`,
      );
    }

    const payout = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payout.create({
        data: {
          payoutNumber: generatePayoutNumber(),
          sellerProfileId: dto.sellerProfileId,
          amount,
          status: "PENDING",
          method: dto.method ?? null,
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          periodFrom: dto.periodFrom ? new Date(dto.periodFrom) : null,
          periodTo: dto.periodTo ? new Date(dto.periodTo) : null,
          processedById: actor.id,
        },
      });
      await this.ledger.record(tx, {
        sellerProfileId: dto.sellerProfileId,
        payoutId: created.id,
        type: "PAYOUT",
        amount: amount.negated(),
        description: `Payout ${created.payoutNumber}`,
        createdById: actor.id,
      });
      return created;
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "payout.create",
      entityType: "Payout",
      entityId: payout.id,
      after: { sellerProfileId: dto.sellerProfileId, amount: amount.toString() },
      ...meta,
    });
    return payout;
  }

  async updatePayout(
    id: string,
    dto: UpdatePayoutDto,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ) {
    const existing = await this.prisma.payout.findUnique({ where: { id } });
    if (!existing) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Payout not found");
    }
    const payout = await this.prisma.payout.update({
      where: { id },
      data: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.method !== undefined ? { method: dto.method } : {}),
        ...(dto.reference !== undefined ? { reference: dto.reference } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.status === "PAID" ? { processedAt: new Date(), processedById: actor.id } : {}),
      },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "payout.update",
      entityType: "Payout",
      entityId: id,
      before: { status: existing.status },
      after: { status: payout.status },
      ...meta,
    });
    return payout;
  }

  async recordDuesPayment(
    sellerProfileId: string,
    dto: DuesPaymentDto,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<{ balance: string }> {
    await this.assertSeller(sellerProfileId);
    await this.ledger.record(this.prisma, {
      sellerProfileId,
      type: "DUES_PAYMENT",
      amount: new Prisma.Decimal(dto.amount),
      description: dto.note ?? `Dues payment (${dto.method ?? "manual"})`,
      createdById: actor.id,
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "seller.dues_payment",
      entityType: "SellerProfile",
      entityId: sellerProfileId,
      after: { amount: dto.amount },
      ...meta,
    });
    return { balance: (await this.ledger.balance(sellerProfileId)).toFixed(2) };
  }

  async recordAdjustment(
    sellerProfileId: string,
    dto: AdjustmentDto,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ): Promise<{ balance: string }> {
    await this.assertSeller(sellerProfileId);
    await this.ledger.record(this.prisma, {
      sellerProfileId,
      type: "ADJUSTMENT",
      amount: new Prisma.Decimal(dto.amount),
      description: dto.note,
      createdById: actor.id,
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "seller.adjustment",
      entityType: "SellerProfile",
      entityId: sellerProfileId,
      after: { amount: dto.amount, note: dto.note },
      ...meta,
    });
    return { balance: (await this.ledger.balance(sellerProfileId)).toFixed(2) };
  }

  async sellerLedger(sellerProfileId: string, query: QueryLedgerDto) {
    await this.assertSeller(sellerProfileId);
    return this.ledger.list(sellerProfileId, query);
  }

  async sellerEarnings(userId: string) {
    const profile = await this.sellerContext.requireProfile(userId);
    const balances = await this.ledger.balances(profile.id);
    const [ledger, payouts] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        where: { sellerProfileId: profile.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      this.prisma.payout.findMany({
        where: { sellerProfileId: profile.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    return { ...balances, balance: balances.net, ledger, payouts };
  }

  async sellerBalance(sellerProfileId: string) {
    await this.assertSeller(sellerProfileId);
    return this.ledger.balances(sellerProfileId);
  }

  private async assertSeller(sellerProfileId: string): Promise<void> {
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { id: sellerProfileId },
      select: { id: true },
    });
    if (!seller) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Seller not found");
    }
  }
}
