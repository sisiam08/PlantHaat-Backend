import { Injectable } from "@nestjs/common";

import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

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
}
