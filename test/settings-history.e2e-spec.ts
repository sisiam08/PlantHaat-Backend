import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

import { applySettingChange } from "../src/modules/settings/settings-history";
import { PrismaService } from "../src/prisma/prisma.service";

describe("settings history real DB", () => {
  const prisma = new PrismaService();
  const prefix = `test.settingsHistory.${Date.now()}.`;
  let adminId = "";

  beforeAll(async () => {
    await prisma.$connect();
    const admin = await prisma.user.create({
      data: {
        email: `settings_history_${randomUUID()}@example.com`,
        name: "History Test Admin",
        passwordHash: "not-used",
        role: "ADMIN",
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.systemSettingHistory.deleteMany({ where: { key: { startsWith: prefix } } });
    await prisma.systemSetting.deleteMany({ where: { key: { startsWith: prefix } } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it("writes setting and one history row with the previous value", async () => {
    const key = `${prefix}success`;
    await prisma.$transaction((tx) => applySettingChange(tx, key, 2, adminId, undefined, 1));
    const history = await prisma.systemSettingHistory.findMany({ where: { key } });
    expect(history).toHaveLength(1);
    expect(history[0]?.oldValue).toBe(1);
    expect(history[0]?.newValue).toBe(2);
    expect(history[0]?.updatedById).toBe(adminId);
  });

  it("rolls back both setting and history on a forced FK failure", async () => {
    const key = `${prefix}rollback`;
    await expect(
      prisma.$transaction((tx) => applySettingChange(tx, key, 2, "missing-user-id", undefined, 1)),
    ).rejects.toBeTruthy();
    await expect(prisma.systemSetting.findUnique({ where: { key } })).resolves.toBeNull();
    await expect(prisma.systemSettingHistory.count({ where: { key } })).resolves.toBe(0);
  });

  it("serializes 10 concurrent writes into a clean old→new chain", async () => {
    const key = `${prefix}concurrent`;
    await Promise.all(
      Array.from({ length: 10 }, (_, value) =>
        prisma.$transaction((tx) =>
          applySettingChange(tx, key, value, adminId, undefined, -1),
        ),
      ),
    );
    const history = await prisma.systemSettingHistory.findMany({
      where: { key },
      orderBy: { sequence: "asc" },
    });
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    expect(history).toHaveLength(10);
    expect(history[0]?.oldValue).toBe(-1);
    for (let index = 1; index < history.length; index++) {
      expect(history[index]?.oldValue).toBe(history[index - 1]?.newValue);
    }
    expect(setting?.value).toBe(history[history.length - 1]?.newValue);
  });

  it("records duplicate identical writes as a chain of separate entries", async () => {
    const key = `${prefix}duplicate`;
    for (let attempt = 0; attempt < 2; attempt++) {
      await prisma.$transaction((tx) => applySettingChange(tx, key, 5, adminId, undefined, -1));
    }
    const history = await prisma.systemSettingHistory.findMany({
      where: { key },
      orderBy: { sequence: "asc" },
    });
    expect(history.map((row) => [row.oldValue, row.newValue])).toEqual([
      [-1, 5],
      [5, 5],
    ]);
  });
});
