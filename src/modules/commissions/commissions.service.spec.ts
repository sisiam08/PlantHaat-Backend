import { jest } from "@jest/globals";

import { ErrorCode } from "../../common/errors/error-codes";
import type { PrismaService } from "../../prisma/prisma.service";
import type { AuditService } from "../audit/audit.service";
import type { SettingsService } from "../settings/settings.service";
import { CommissionsService, type CommissionRateInput } from "./commissions.service";

type PrismaMockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;

const mockFn = (): PrismaMockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();

const actor = { id: "admin-1", role: "ADMIN" } as never;

function createPrismaMock() {
  return {
    commissionRule: {
      findFirst: mockFn(),
      findMany: mockFn(),
      findUnique: mockFn(),
      create: mockFn(),
      update: mockFn(),
      delete: mockFn(),
      count: mockFn(),
    },
    category: { findUnique: mockFn() },
    sellerProfile: { findUnique: mockFn() },
    $transaction: mockFn(),
  };
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  const settings = {
    getNumber: jest.fn<() => Promise<number>>().mockResolvedValue(5),
  } as unknown as SettingsService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  return new CommissionsService(prisma as unknown as PrismaService, settings, audit);
}

describe("CommissionsService", () => {
  describe("resolveRatePercent", () => {
    const input: CommissionRateInput = {
      sellerProfileId: "seller-1",
      categoryId: "cat-1",
      parentCategoryId: "parent-1",
    };

    it("prefers the seller rule", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.findFirst
        .mockResolvedValueOnce({ ratePercent: 2.5 })
        .mockResolvedValue(null);
      const service = createService(prisma);

      const result = await service.resolveRatePercent(input);

      expect(result).toBe(2.5);
      expect(prisma.commissionRule.findFirst).toHaveBeenCalledTimes(1);
      const firstCall = prisma.commissionRule.findFirst.mock.calls[0][0] as {
        where: { scope: string; sellerProfileId: string };
      };
      expect(firstCall.where.scope).toBe("SELLER");
      expect(firstCall.where.sellerProfileId).toBe("seller-1");
    });

    it("falls back to the item's category rule", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ratePercent: 4 });
      const service = createService(prisma);

      const result = await service.resolveRatePercent(input);

      expect(result).toBe(4);
      const secondCall = prisma.commissionRule.findFirst.mock.calls[1][0] as {
        where: { categoryId: string; scope: string };
      };
      expect(secondCall.where.scope).toBe("CATEGORY");
      expect(secondCall.where.categoryId).toBe("cat-1");
    });

    it("uses the parent category when the item's category has none", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ratePercent: 9.75 });
      const service = createService(prisma);

      const result = await service.resolveRatePercent(input);

      expect(result).toBe(9.75);
      const thirdCall = prisma.commissionRule.findFirst.mock.calls[2][0] as {
        where: { categoryId: string };
      };
      expect(thirdCall.where.categoryId).toBe("parent-1");
    });

    it("skips the parent lookup when there is none", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ratePercent: 10 });
      const service = createService(prisma);

      const result = await service.resolveRatePercent({ ...input, parentCategoryId: null });

      expect(result).toBe(10);
      expect(prisma.commissionRule.findFirst).toHaveBeenCalledTimes(3);
    });

    it("uses the global rule next", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ratePercent: 6 });
      const service = createService(prisma);

      const result = await service.resolveRatePercent(input);

      expect(result).toBe(6);
      const lastCall = prisma.commissionRule.findFirst.mock.calls[3][0] as {
        where: { scope: string };
      };
      expect(lastCall.where.scope).toBe("GLOBAL");
    });

    it("reports the same effective default that the calculation uses", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.findFirst.mockResolvedValue(null);
      const service = createService(prisma);

      const effective = await service.defaultRatePercent();
      const calculated = await service.resolveRatePercent(input);

      expect(effective).toEqual({
        settingPercent: 5,
        globalRuleId: null,
        globalRatePercent: null,
        effectivePercent: 5,
        source: "SETTINGS",
      });
      expect(calculated.toString()).toBe(String(effective.effectivePercent));
    });

    it("reports an active GLOBAL rule as the effective default", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.findFirst.mockResolvedValue({
        id: "global-1",
        ratePercent: { toString: () => "7.5", valueOf: () => 7.5 },
      });
      const service = createService(prisma);

      const effective = await service.defaultRatePercent();
      expect(effective.effectivePercent).toBe(7.5);
      expect(effective.globalRuleId).toBe("global-1");
      expect(effective.source).toBe("GLOBAL_RULE");
    });

    it("falls back to the default settings value", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.findFirst.mockResolvedValue(null);
      const service = createService(prisma);

      const result = await service.resolveRatePercent(input);

      expect(result.toString()).toBe("5");
    });
  });

  describe("rules CRUD", () => {
    it("creates a global rule and audits it", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.create.mockResolvedValue({
        id: "rule-1",
        scope: "GLOBAL",
        ratePercent: { toString: () => "5.00" },
      });
      const service = createService(prisma);

      await service.createRule({ scope: "GLOBAL", ratePercent: 5 } as never, actor, {});

      expect(prisma.commissionRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ scope: "GLOBAL", categoryId: null }),
        }),
      );
    });

    it("rejects a CATEGORY rule without categoryId", async () => {
      const service = createService(createPrismaMock());
      await expect(
        service.createRule({ scope: "CATEGORY", ratePercent: 5 } as never, actor, {}),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    });

    it("rejects a CATEGORY rule for an unknown category", async () => {
      const prisma = createPrismaMock();
      prisma.category.findUnique.mockResolvedValue(null);
      const service = createService(prisma);
      await expect(
        service.createRule(
          { scope: "CATEGORY", categoryId: "nope", ratePercent: 5 } as never,
          actor,
          {},
        ),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    });

    it("rejects a SELLER rule without sellerProfileId", async () => {
      const service = createService(createPrismaMock());
      await expect(
        service.createRule({ scope: "SELLER", ratePercent: 5 } as never, actor, {}),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    });

    it("rejects a SELLER rule for an unknown seller", async () => {
      const prisma = createPrismaMock();
      prisma.sellerProfile.findUnique.mockResolvedValue(null);
      const service = createService(prisma);
      await expect(
        service.createRule(
          { scope: "SELLER", sellerProfileId: "nope", ratePercent: 5 } as never,
          actor,
          {},
        ),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    });

    it("creates a category rule when the category exists", async () => {
      const prisma = createPrismaMock();
      prisma.category.findUnique.mockResolvedValue({ id: "cat-1" });
      prisma.commissionRule.create.mockResolvedValue({
        id: "rule-2",
        scope: "CATEGORY",
        ratePercent: { toString: () => "5.00" },
      });
      const service = createService(prisma);

      await service.createRule(
        { scope: "CATEGORY", categoryId: "cat-1", ratePercent: 5 } as never,
        actor,
        {},
      );

      expect(prisma.commissionRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoryId: "cat-1" }),
        }),
      );
    });

    it("creates a seller rule when the seller exists", async () => {
      const prisma = createPrismaMock();
      prisma.sellerProfile.findUnique.mockResolvedValue({ id: "seller-1" });
      prisma.commissionRule.create.mockResolvedValue({
        id: "rule-3",
        scope: "SELLER",
        ratePercent: { toString: () => "5.00" },
      });
      const service = createService(prisma);

      await service.createRule(
        { scope: "SELLER", sellerProfileId: "seller-1", ratePercent: 5 } as never,
        actor,
        {},
      );

      expect(prisma.commissionRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sellerProfileId: "seller-1" }),
        }),
      );
    });

    it("updates an existing rule", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.findUnique.mockResolvedValue({
        id: "rule-1",
        ratePercent: "5.00",
        isActive: true,
      });
      prisma.commissionRule.update.mockResolvedValue({
        id: "rule-1",
        ratePercent: "7.50",
        isActive: true,
      });
      const service = createService(prisma);

      await service.updateRule("rule-1", { ratePercent: 7.5 } as never, actor, {});

      expect(prisma.commissionRule.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "rule-1" } }),
      );
    });

    it("throws NOT_FOUND when updating a missing rule", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.findUnique.mockResolvedValue(null);
      const service = createService(prisma);
      await expect(service.updateRule("nope", {} as never, actor, {})).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });

    it("deletes an existing rule", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.findUnique.mockResolvedValue({
        id: "rule-1",
        scope: "GLOBAL",
        ratePercent: "5.00",
      });
      const service = createService(prisma);

      await service.removeRule("rule-1", actor, {});

      expect(prisma.commissionRule.delete).toHaveBeenCalledWith({ where: { id: "rule-1" } });
    });

    it("throws NOT_FOUND when deleting a missing rule", async () => {
      const prisma = createPrismaMock();
      prisma.commissionRule.findUnique.mockResolvedValue(null);
      const service = createService(prisma);
      await expect(service.removeRule("nope", actor, {})).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });

    it("lists rules through a paginated transaction", async () => {
      const prisma = createPrismaMock();
      prisma.$transaction.mockImplementation(async (...args: unknown[]) => {
        const op = args[0] as unknown;
        return Promise.all(op as Promise<unknown>[]);
      });
      prisma.commissionRule.findMany.mockResolvedValue([{ id: "rule-1" }]);
      prisma.commissionRule.count.mockResolvedValue(1);
      const service = createService(prisma);

      const result = (await service.listRules({ page: 1, limit: 20 } as never)) as {
        data: unknown[];
        meta: { total: number };
      };

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});

