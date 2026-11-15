import { jest } from "@jest/globals";
import type { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "./settings.service";

function fakePrisma() {
  const rows = new Map<string, unknown>();
  const history: Array<Record<string, unknown>> = [];
  const tx = {
    systemSetting: {
      findMany: jest.fn(async () => [...rows.entries()].map(([key, value]) => ({ key, value }))),
      upsert: jest.fn(async ({ where, update, create }) => {
        rows.set(where.key, update?.value ?? create.value);
        return { key: where.key, value: rows.get(where.key) };
      }),
    },
    systemSettingHistory: { create: jest.fn(async ({ data }) => history.push(data)) },
  };
  const prisma = {
    systemSetting: {
      findMany: jest.fn(async () => [...rows.entries()].map(([key, value]) => ({ key, value }))),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
  } as unknown as PrismaService;
  return { prisma, rows, history, tx };
}

describe("SettingsService", () => {
  it("falls back to registry defaults", async () => {
    const { prisma } = fakePrisma();
    const service = new SettingsService(prisma);
    await expect(service.get<boolean>("payment.advance.enabled")).resolves.toBe(false);
    await expect(service.getNumber("commission.default")).resolves.toBe(10);
  });

  it("invalidates cache after write and returns the new value", async () => {
    const { prisma } = fakePrisma();
    const service = new SettingsService(prisma);
    await service.getNumber("commission.default");
    await service.update({ "commission.default": 12 }, "admin-1");
    await expect(service.getNumber("commission.default")).resolves.toBe(12);
  });

  it("writes one history row per change in the same transaction", async () => {
    const { prisma, history, tx } = fakePrisma();
    const service = new SettingsService(prisma);
    await service.update({ "commission.default": 12 }, "admin-1", { reason: "test" });
    expect(tx.systemSettingHistory.create).toHaveBeenCalledTimes(1);
    expect(history[0]).toMatchObject({ key: "commission.default", newValue: 12, reason: "test" });
  });

  it("rejects both payment methods disabled", async () => {
    const { prisma } = fakePrisma();
    const service = new SettingsService(prisma);
    await expect(
      service.update({ "payment.cod.enabled": false, "payment.advance.enabled": false }, "admin-1"),
    ).rejects.toThrow(/At least one payment/);
  });
});
