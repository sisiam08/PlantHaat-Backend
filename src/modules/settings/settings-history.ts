import type { Prisma } from "../../generated/prisma/client";

export async function applySettingChange(
  tx: Prisma.TransactionClient,
  key: string,
  value: unknown,
  updatedById: string,
  meta: { reason?: string; ipAddress?: string; userAgent?: string } | undefined,
  fallback: unknown,
  batchId?: string,
): Promise<void> {
  // Create the row first so SELECT ... FOR UPDATE always has a row to lock.
  await tx.$executeRaw`
    INSERT INTO "SystemSetting" ("key", "value", "updatedById", "updatedAt")
    VALUES (${key}, CAST(${JSON.stringify(fallback)} AS jsonb), ${updatedById}, NOW())
    ON CONFLICT ("key") DO NOTHING
  `;
  const rows = await tx.$queryRaw<Array<{ value: unknown }>>`
    SELECT "value" FROM "SystemSetting" WHERE "key" = ${key} FOR UPDATE
  `;
  const oldValue = rows[0]?.value;
  await tx.systemSetting.update({
    where: { key },
    data: { value: value as Prisma.InputJsonValue, updatedById },
  });
  await tx.systemSettingHistory.create({
    data: {
      key,
      batchId,
      oldValue: oldValue as Prisma.InputJsonValue,
      newValue: value as Prisma.InputJsonValue,
      updatedById,
      reason: meta?.reason,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    },
  });
}
