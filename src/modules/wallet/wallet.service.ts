import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { RequestMeta } from "../../common/utils/request-meta";
import { decryptAesGcm, encryptAesGcm } from "../../common/utils/crypto";
import { generatePayoutNumber } from "../../common/utils/order-number";
import { isValidBdPhone, normalizeBdPhone } from "../../common/utils/phone";
import { Prisma } from "../../generated/prisma/client";
import type { PayoutMethod } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import { AppConfigService } from "../../config/app-config.service";
import { AuditService } from "../audit/audit.service";
import { LedgerService } from "../ledger/ledger.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SellerContextService } from "../sellers/seller-context.service";
import { SettingsService } from "../settings/settings.service";
import type {
  PayWithdrawalDto,
  PayoutProfileDto,
  QueryWithdrawalsDto,
  RejectWithdrawalDto,
  WithdrawalRequestDto,
} from "./dto/wallet.dto";

function maskAccount(method: PayoutMethod, number: string): string {
  const compact = number.replace(/\s+/g, "");
  if (method === "BKASH" || method === "NAGAD" || method === "ROCKET") {
    return `${compact.slice(0, 3)}*****${compact.slice(-2)}`;
  }
  return `****${compact.slice(-4)}`;
}

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly sellerContext: SellerContextService,
    private readonly config: AppConfigService,
  ) {}

  private encryptionKey(): string {
    return this.config.values.DATA_ENCRYPTION_KEY;
  }

  async wallet(userId: string) {
    const profile = await this.sellerContext.requireProfile(userId);
    const balances = await this.ledger.balances(profile.id);
    const pendingOrders = await this.ledger.pendingOrders(profile.id);
    const payoutProfile = await this.prisma.sellerPayoutAccount.findFirst({
      where: { sellerProfileId: profile.id, isDefault: true },
      orderBy: { createdAt: "desc" },
    });
    const cooldownHours = await this.settings.getNumber("payout.cooldownHours");
    const methods = (await this.settings.get<PayoutMethod[]>("payout.methods")) ?? [];
    return {
      balances: {
        available: balances.available.toFixed(2),
        pending: balances.pending.toFixed(2),
        onHold: balances.onHold.toFixed(2),
        withdrawalReserved: balances.withdrawalReserved.toFixed(2),
        totalWithdrawn: balances.totalWithdrawn.toFixed(2),
        codDues: balances.codDues.toFixed(2),
        net: balances.net.toFixed(2),
      },
      pendingOrders,
      payoutProfile: payoutProfile
        ? {
            method: payoutProfile.method,
            accountMasked: payoutProfile.accountMasked,
            accountName: payoutProfile.accountName,
            updatedAt: payoutProfile.updatedAt.toISOString(),
            cooldownUntil: new Date(
              payoutProfile.updatedAt.getTime() + cooldownHours * 3_600_000,
            ).toISOString(),
          }
        : null,
      settings: {
        minimumAmount: Number(await this.settings.getNumber("payout.minimumAmount")),
        methods,
        maxPendingRequests: Number(
          await this.settings.getNumber("payout.maxPendingRequests"),
        ),
        codDuesLimit: Number(await this.settings.getNumber("wallet.codDuesLimit")),
        processingText: await this.settings.get<string>("payout.processingText"),
      },
    };
  }

  async transactions(userId: string, query: { page?: number; limit?: number; type?: string }) {
    const profile = await this.sellerContext.requireProfile(userId);
    return this.ledger.list(profile.id, query as never);
  }

  async profile(userId: string) {
    const profile = await this.sellerContext.requireProfile(userId);
    const account = await this.prisma.sellerPayoutAccount.findFirst({
      where: { sellerProfileId: profile.id, isDefault: true },
      orderBy: { createdAt: "desc" },
    });
    if (!account) return null;
    return {
      method: account.method,
      accountMasked: account.accountMasked,
      accountName: account.accountName,
      updatedAt: account.updatedAt.toISOString(),
    };
  }

  async saveProfile(userId: string, dto: PayoutProfileDto, meta: RequestMeta) {
    const profile = await this.sellerContext.requireProfile(userId);
    const allowed = (await this.settings.get<PayoutMethod[]>("payout.methods")) ?? [];
    if (!allowed.includes(dto.method) || dto.method === "ROCKET") {
      throw AppException.unprocessable(
        ErrorCode.PAYOUT_METHOD_NOT_ALLOWED,
        "This payout method is not enabled",
      );
    }
    let number = dto.accountNumber.replace(/[\s-]/g, "");
    if (dto.method === "BKASH" || dto.method === "NAGAD") {
      if (!isValidBdPhone(number)) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          "A valid Bangladesh mobile number is required",
        );
      }
      number = normalizeBdPhone(number).replace(/^\+88/, "");
    } else if (!/^\d{6,20}$/.test(number)) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "A valid bank account number is required",
      );
    }

    const existing = await this.prisma.sellerPayoutAccount.findFirst({
      where: { sellerProfileId: profile.id, isDefault: true },
      orderBy: { createdAt: "desc" },
    });
    const masked = maskAccount(dto.method, number);
    if (existing) {
      const currentNumber = decryptAesGcm(existing.accountNumberEnc, this.encryptionKey());
      const cooldownHours = await this.settings.getNumber("payout.cooldownHours");
      const changed =
        currentNumber !== number ||
        existing.method !== dto.method ||
        existing.accountName !== dto.accountName;
      if (
        changed &&
        cooldownHours > 0 &&
        Date.now() < existing.updatedAt.getTime() + cooldownHours * 3_600_000
      ) {
        throw AppException.unprocessable(
          ErrorCode.PAYOUT_PROFILE_COOLDOWN,
          "Payout profile can be changed once per cooldown window",
        );
      }
    }

    const saved = existing
      ? await this.prisma.sellerPayoutAccount.update({
          where: { id: existing.id },
          data: {
            method: dto.method,
            accountName: dto.accountName,
            accountNumberEnc: encryptAesGcm(number, this.encryptionKey()),
            accountMasked: masked,
          },
        })
      : await this.prisma.sellerPayoutAccount.create({
          data: {
            sellerProfileId: profile.id,
            method: dto.method,
            accountName: dto.accountName,
            accountNumberEnc: encryptAesGcm(number, this.encryptionKey()),
            accountMasked: masked,
            isDefault: true,
          },
        });

    await this.notifications.create({
      userId,
      type: "PAYOUT_PROCESSED",
      title: "Payout profile updated",
      body: `Your payout account ending ${masked.slice(-2)} was updated.`,
      data: { accountMasked: masked, method: saved.method },
    });
    await this.audit.record({
      actorId: userId,
      actorRole: "SELLER",
      action: "seller.payout_profile",
      entityType: "SellerPayoutAccount",
      entityId: saved.id,
      after: { method: saved.method, accountMasked: masked },
      ...meta,
    });
    return {
      method: saved.method,
      accountMasked: saved.accountMasked,
      accountName: saved.accountName,
      updatedAt: saved.updatedAt.toISOString(),
    };
  }

  async requestWithdrawal(
    userId: string,
    dto: WithdrawalRequestDto,
    idempotencyKey: string | undefined,
    meta: RequestMeta,
  ) {
    const profile = await this.sellerContext.requireProfile(userId);
    if (idempotencyKey) {
      const existing = await this.prisma.payout.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        return this.toWithdrawal(existing);
      }
    }
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) {
      throw AppException.unprocessable(
        ErrorCode.PAYOUT_INVALID_AMOUNT,
        "Withdrawal amount must be positive",
      );
    }
    const method = dto.method ?? (await this.profile(userId))?.method;
    const allowed = (await this.settings.get<PayoutMethod[]>("payout.methods")) ?? [];
    if (!method || !allowed.includes(method) || method === "ROCKET") {
      throw AppException.unprocessable(
        ErrorCode.PAYOUT_METHOD_NOT_ALLOWED,
        "This payout method is not enabled",
      );
    }
    const account = await this.prisma.sellerPayoutAccount.findFirst({
      where: { sellerProfileId: profile.id, isDefault: true },
      orderBy: { createdAt: "desc" },
    });
    if (!account) {
      throw AppException.unprocessable(
        ErrorCode.PAYOUT_PROFILE_REQUIRED,
        "Add a payout profile before requesting a withdrawal",
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SellerProfile" WHERE "id" = ${profile.id} FOR UPDATE`;
      const balances = await this.ledger.balances(profile.id);
      const minimum = await this.settings.getNumber("payout.minimumAmount");
      if (amount.lt(minimum)) {
        throw AppException.unprocessable(
          ErrorCode.PAYOUT_BELOW_MINIMUM,
          `Minimum withdrawal is ${minimum}`,
        );
      }
      const duesLimit = await this.settings.getNumber("wallet.codDuesLimit");
      if (balances.codDues.gt(duesLimit)) {
        throw AppException.unprocessable(
          ErrorCode.PAYOUT_COD_DUES_BLOCKED,
          `Withdrawals are blocked while COD dues exceed ${duesLimit}`,
        );
      }
      if (amount.gt(balances.available)) {
        throw AppException.unprocessable(
          ErrorCode.PAYOUT_EXCEEDS_AVAILABLE,
          `Withdrawal exceeds the available balance (${balances.available.toFixed(2)})`,
        );
      }
      const maxPending = await this.settings.getNumber("payout.maxPendingRequests");
      const pending = await tx.payout.count({
        where: {
          sellerProfileId: profile.id,
          requestedById: { not: null },
          status: { in: ["PENDING", "PROCESSING"] },
        },
      });
      if (pending >= maxPending) {
        throw AppException.unprocessable(
          ErrorCode.PAYOUT_TOO_MANY_PENDING,
          `You already have ${pending} pending withdrawal request(s)`,
        );
      }
      const payout = await tx.payout.create({
        data: {
          payoutNumber: generatePayoutNumber(),
          sellerProfileId: profile.id,
          amount,
          status: "PENDING",
          method,
          accountMasked: account.accountMasked,
          requestedById: userId,
          balanceSnapshot: balances.available,
          idempotencyKey: idempotencyKey ?? null,
          note: "Seller withdrawal request",
        },
      });
      await this.ledger.postBatch(tx, `withdrawal_reserve:${payout.id}`, [
        {
          account: "SELLER_AVAILABLE",
          amount: amount.negated(),
          type: "WITHDRAWAL_RESERVE",
          sellerProfileId: profile.id,
          payoutId: payout.id,
          withdrawalId: payout.id,
          description: `Withdrawal ${payout.payoutNumber} reserved`,
          createdById: userId,
        },
        {
          account: "SELLER_WITHDRAWAL_RESERVED",
          amount,
          type: "WITHDRAWAL_RESERVE",
          sellerProfileId: profile.id,
          payoutId: payout.id,
          withdrawalId: payout.id,
          description: `Withdrawal ${payout.payoutNumber} reserved`,
          createdById: userId,
        },
      ]);
      return payout;
    });

    await this.notifications.create({
      userId,
      type: "PAYOUT_PROCESSED",
      title: "Withdrawal requested",
      body: `Your withdrawal of ${amount.toFixed(2)} is pending admin payout.`,
      data: { payoutId: created.id, amount: amount.toFixed(2) },
    });
    await this.notifications.createForAdmins({
      type: "PAYOUT_PROCESSED",
      title: "New withdrawal request",
      body: `A seller requested ${amount.toFixed(2)} via ${method}.`,
      data: { payoutId: created.id },
    });
    await this.audit.record({
      actorId: userId,
      actorRole: "SELLER",
      action: "withdrawal.request",
      entityType: "Payout",
      entityId: created.id,
      after: { amount: amount.toFixed(2), method },
      ...meta,
    });
    return this.toWithdrawal(created);
  }

  async listMine(userId: string, query: QueryWithdrawalsDto) {
    const profile = await this.sellerContext.requireProfile(userId);
    return this.list({ sellerProfileId: profile.id, requestedOnly: true }, query);
  }

  async listForAdmin(query: QueryWithdrawalsDto) {
    return this.list({ requestedOnly: true }, query);
  }

  private async list(
    scope: { sellerProfileId?: string; requestedOnly?: boolean },
    query: QueryWithdrawalsDto,
  ) {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.PayoutWhereInput = {
      ...(scope.sellerProfileId ? { sellerProfileId: scope.sellerProfileId } : {}),
      ...(scope.requestedOnly ? { requestedById: { not: null } } : {}),
      ...(query.status ? { status: query.status as never } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payout.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          sellerProfile: {
            select: {
              id: true,
              businessName: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      }),
      this.prisma.payout.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        ...this.toWithdrawal(row),
        seller: {
          id: row.sellerProfile.id,
          businessName: row.sellerProfile.businessName,
          name: row.sellerProfile.user.name,
        },
        balanceSnapshot: row.balanceSnapshot?.toFixed(2) ?? null,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async markPaid(
    id: string,
    dto: PayWithdrawalDto,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ) {
    const paid = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Payout" WHERE "id" = ${id} FOR UPDATE`;
      const payout = await tx.payout.findUnique({ where: { id } });
      if (!payout) throw AppException.notFound(ErrorCode.NOT_FOUND, "Withdrawal not found");
      if (payout.status === "PAID") return payout;
      if (payout.status !== "PENDING" && payout.status !== "PROCESSING") {
        throw AppException.conflict(
          ErrorCode.WITHDRAWAL_INVALID_STATUS,
          "Only pending withdrawals can be paid",
        );
      }
      const updated = await tx.payout.update({
        where: { id },
        data: {
          status: "PAID",
          reference: dto.reference,
          processedAt: new Date(),
          processedById: actor.id,
        },
      });
      await this.ledger.postBatch(tx, `withdrawal_paid:${id}`, [
        {
          account: "SELLER_WITHDRAWAL_RESERVED",
          amount: payout.amount.negated(),
          type: "WITHDRAWAL_PAID",
          sellerProfileId: payout.sellerProfileId,
          payoutId: id,
          withdrawalId: id,
          description: `Withdrawal ${payout.payoutNumber} paid`,
          createdById: actor.id,
        },
        {
          account: "SELLER_PAID_OUT",
          amount: payout.amount,
          type: "WITHDRAWAL_PAID",
          sellerProfileId: payout.sellerProfileId,
          payoutId: id,
          withdrawalId: id,
          description: `Withdrawal ${payout.payoutNumber} paid`,
          createdById: actor.id,
        },
      ]);
      return updated;
    });
    await this.notifySeller(paid.sellerProfileId, "Withdrawal paid", "Your withdrawal was paid.", {
      payoutId: id,
      reference: dto.reference,
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "withdrawal.paid",
      entityType: "Payout",
      entityId: id,
      after: { reference: dto.reference },
      ...meta,
    });
    return this.toWithdrawal(paid);
  }

  async reject(
    id: string,
    dto: RejectWithdrawalDto,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ) {
    const rejected = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Payout" WHERE "id" = ${id} FOR UPDATE`;
      const payout = await tx.payout.findUnique({ where: { id } });
      if (!payout) throw AppException.notFound(ErrorCode.NOT_FOUND, "Withdrawal not found");
      if (payout.status === "REJECTED") return payout;
      if (payout.status !== "PENDING" && payout.status !== "PROCESSING") {
        throw AppException.conflict(
          ErrorCode.WITHDRAWAL_INVALID_STATUS,
          "Only pending withdrawals can be rejected",
        );
      }
      const updated = await tx.payout.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectionReason: dto.reason,
          processedAt: new Date(),
          processedById: actor.id,
        },
      });
      await this.ledger.postBatch(tx, `withdrawal_rejected:${id}`, [
        {
          account: "SELLER_WITHDRAWAL_RESERVED",
          amount: payout.amount.negated(),
          type: "WITHDRAWAL_REJECTED",
          sellerProfileId: payout.sellerProfileId,
          payoutId: id,
          withdrawalId: id,
          description: `Withdrawal ${payout.payoutNumber} rejected`,
          createdById: actor.id,
        },
        {
          account: "SELLER_AVAILABLE",
          amount: payout.amount,
          type: "WITHDRAWAL_REJECTED",
          sellerProfileId: payout.sellerProfileId,
          payoutId: id,
          withdrawalId: id,
          description: `Withdrawal ${payout.payoutNumber} reserved amount returned`,
          createdById: actor.id,
        },
      ]);
      return updated;
    });
    await this.notifySeller(
      rejected.sellerProfileId,
      "Withdrawal rejected",
      `Your withdrawal was rejected: ${dto.reason}`,
      { payoutId: id },
    );
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "withdrawal.rejected",
      entityType: "Payout",
      entityId: id,
      after: { reason: dto.reason },
      ...meta,
    });
    return this.toWithdrawal(rejected);
  }

  private async notifySeller(sellerProfileId: string, title: string, body: string, data: unknown) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { id: sellerProfileId },
      select: { userId: true },
    });
    if (!profile) return;
    await this.notifications.create({
      userId: profile.userId,
      type: "PAYOUT_PROCESSED",
      title,
      body,
      data,
    });
  }

  private toWithdrawal(row: {
    id: string;
    payoutNumber: string;
    sellerProfileId: string;
    amount: Prisma.Decimal;
    status: string;
    method: PayoutMethod | null;
    accountMasked: string | null;
    reference: string | null;
    rejectionReason: string | null;
    requestedById: string | null;
    balanceSnapshot: Prisma.Decimal | null;
    createdAt: Date;
    processedAt: Date | null;
  }) {
    return {
      id: row.id,
      payoutNumber: row.payoutNumber,
      sellerProfileId: row.sellerProfileId,
      amount: row.amount.toFixed(2),
      status: row.status,
      method: row.method,
      accountMasked: row.accountMasked,
      reference: row.reference,
      rejectionReason: row.rejectionReason,
      requestedById: row.requestedById,
      balanceSnapshot: row.balanceSnapshot?.toFixed(2) ?? null,
      createdAt: row.createdAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
    };
  }
}
