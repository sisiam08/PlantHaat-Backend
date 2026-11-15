import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";

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

  it("writes setting and one history row in one transaction", async () => {
    const key = `${prefix}success`;
    await prisma.$transaction(async (tx) => {
      await tx.systemSetting.create({ data: { key, value: 1, updatedById: adminId } });
      await tx.systemSettingHistory.create({
        data: { key, oldValue: 1, newValue: 2, updatedById: adminId },
      });
    });
    const history = await prisma.systemSettingHistory.findMany({ where: { key } });
    expect(history).toHaveLength(1);
    expect(history[0]?.updatedById).toBe(adminId);
    expect(history[0]?.newValue).toBe(2);
  });

  it("rolls back both setting and history on a forced FK failure", async () => {
    const key = `${prefix}rollback`;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.systemSetting.create({ data: { key, value: 1, updatedById: adminId } });
        await tx.systemSettingHistory.create({
          data: { key, newValue: 2, updatedById: "missing-user-id" },
        });
      }),
    ).rejects.toBeTruthy();
    await expect(prisma.systemSetting.findUnique({ where: { key } })).resolves.toBeNull();
    await expect(prisma.systemSettingHistory.count({ where: { key } })).resolves.toBe(0);
  });

  it("keeps one history row per write under 10 concurrent writes", async () => {
    const key = `${prefix}concurrent`;
    await Promise.all(
      Array.from({ length: 10 }, (_, value) =>
        prisma.$transaction(async (tx) => {
          await tx.systemSetting.upsert({
            where: { key },
            update: { value },
            create: { key, value },
          });
          await tx.systemSettingHistory.create({
            data: { key, newValue: value, updatedById: adminId },
          });
        }),
      ),
    );
    const history = await prisma.systemSettingHistory.findMany({ where: { key } });
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    expect(history).toHaveLength(10);
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).toContain(setting?.value);
  });

  it("records duplicate identical writes as separate history entries", async () => {
    const key = `${prefix}duplicate`;
    for (let attempt = 0; attempt < 2; attempt++) {
      await prisma.$transaction(async (tx) => {
        await tx.systemSetting.upsert({
          where: { key },
          update: { value: 5 },
          create: { key, value: 5 },
        });
        await tx.systemSettingHistory.create({
          data: { key, newValue: 5, updatedById: adminId },
        });
      });
    }
    await expect(prisma.systemSettingHistory.count({ where: { key } })).resolves.toBe(2);
  });
});
