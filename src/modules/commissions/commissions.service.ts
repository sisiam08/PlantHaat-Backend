import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import type { RequestMeta } from "../../common/utils/request-meta";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import type {
  CreateCommissionRuleDto,
  QueryCommissionRulesDto,
  UpdateCommissionRuleDto,
} from "./dto/commission-rule.dto";

export interface CommissionRateInput {
  sellerProfileId: string;
  categoryId: string;
  parentCategoryId: string | null;
}

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Most specific active rule wins: SELLER → CATEGORY (item's, then parent)
   * → GLOBAL → setting `commission.default`.
   */
  async resolveRatePercent(input: CommissionRateInput): Promise<Prisma.Decimal> {
    const now = new Date();
    const active = { isActive: true, effectiveFrom: { lte: now } } as const;

    const sellerRule = await this.prisma.commissionRule.findFirst({
      where: { ...active, scope: "SELLER", sellerProfileId: input.sellerProfileId },
      orderBy: { effectiveFrom: "desc" },
    });
    if (sellerRule) {
      return sellerRule.ratePercent;
    }

    const categoryRule = await this.prisma.commissionRule.findFirst({
      where: { ...active, scope: "CATEGORY", categoryId: input.categoryId },
      orderBy: { effectiveFrom: "desc" },
    });
    if (categoryRule) {
      return categoryRule.ratePercent;
    }

    if (input.parentCategoryId) {
      const parentRule = await this.prisma.commissionRule.findFirst({
        where: { ...active, scope: "CATEGORY", categoryId: input.parentCategoryId },
        orderBy: { effectiveFrom: "desc" },
      });
      if (parentRule) {
        return parentRule.ratePercent;
      }
    }

    const globalRule = await this.prisma.commissionRule.findFirst({
      where: { ...active, scope: "GLOBAL" },
      orderBy: { effectiveFrom: "desc" },
    });
    if (globalRule) {
      return globalRule.ratePercent;
    }

    return new Prisma.Decimal(await this.settings.getNumber("commission.default"));
  }

  async listRules(query: QueryCommissionRulesDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.CommissionRuleWhereInput = {
      ...(query.scope ? { scope: query.scope } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.commissionRule.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          sellerProfile: { select: { id: true, businessName: true } },
        },
      }),
      this.prisma.commissionRule.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async createRule(dto: CreateCommissionRuleDto, actor: AuthenticatedUser, meta: RequestMeta) {
    await this.validateScope(dto.scope, dto.categoryId, dto.sellerProfileId);
    const rule = await this.prisma.commissionRule.create({
      data: {
        scope: dto.scope,
        categoryId: dto.scope === "CATEGORY" ? (dto.categoryId ?? null) : null,
        sellerProfileId: dto.scope === "SELLER" ? (dto.sellerProfileId ?? null) : null,
        ratePercent: dto.ratePercent,
        isActive: dto.isActive ?? true,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        createdById: actor.id,
      },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "commission_rule.create",
      entityType: "CommissionRule",
      entityId: rule.id,
      after: { scope: rule.scope, ratePercent: rule.ratePercent.toString() },
      ...meta,
    });
    return rule;
  }

  async updateRule(
    id: string,
    dto: UpdateCommissionRuleDto,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ) {
    const existing = await this.prisma.commissionRule.findUnique({ where: { id } });
    if (!existing) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Commission rule not found");
    }
    const rule = await this.prisma.commissionRule.update({
      where: { id },
      data: {
        ...(dto.ratePercent !== undefined ? { ratePercent: dto.ratePercent } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.effectiveFrom !== undefined ? { effectiveFrom: new Date(dto.effectiveFrom) } : {}),
      },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "commission_rule.update",
      entityType: "CommissionRule",
      entityId: id,
      before: {
        ratePercent: existing.ratePercent.toString(),
        isActive: existing.isActive,
      },
      after: { ratePercent: rule.ratePercent.toString(), isActive: rule.isActive },
      ...meta,
    });
    return rule;
  }

  async removeRule(id: string, actor: AuthenticatedUser, meta: RequestMeta): Promise<void> {
    const existing = await this.prisma.commissionRule.findUnique({
      where: { id },
      select: { id: true, scope: true, ratePercent: true },
    });
    if (!existing) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Commission rule not found");
    }
    await this.prisma.commissionRule.delete({ where: { id } });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "commission_rule.delete",
      entityType: "CommissionRule",
      entityId: id,
      before: { scope: existing.scope, ratePercent: existing.ratePercent.toString() },
      ...meta,
    });
  }

  private async validateScope(
    scope: string,
    categoryId: string | undefined,
    sellerProfileId: string | undefined,
  ): Promise<void> {
    if (scope === "GLOBAL") {
      return;
    }
    if (scope === "CATEGORY") {
      if (!categoryId) {
        throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "categoryId is required");
      }
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });
      if (!category) {
        throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Unknown category");
      }
      return;
    }
    if (scope === "SELLER") {
      if (!sellerProfileId) {
        throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "sellerProfileId is required");
      }
      const seller = await this.prisma.sellerProfile.findUnique({
        where: { id: sellerProfileId },
        select: { id: true },
      });
      if (!seller) {
        throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Unknown seller");
      }
    }
  }
}
