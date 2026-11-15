import type { INestApplication } from "@nestjs/common";

import { Prisma } from "../src/generated/prisma/client";
import type { PrismaService } from "../src/prisma/prisma.service";
import { SETTING_DEFAULTS } from "../src/modules/settings/settings-registry";
import { SettingsService } from "../src/modules/settings/settings.service";

/**
 * Settings live in a process-wide cache. Tests must clear both the rows and the
 * cache, or a value written by one test leaks into the next checkout case.
 */
export async function clearSettings(app: INestApplication, prisma: PrismaService): Promise<void> {
  await prisma.systemSettingHistory.deleteMany();
  await prisma.systemSetting.deleteMany();
  app.get(SettingsService).invalidate();
}

export async function setSettings(
  app: INestApplication,
  prisma: PrismaService,
  values: Record<string, unknown>,
): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
  }
  app.get(SettingsService).invalidate();
}

/** Restore all known keys to registry defaults and drop any unknown test rows. */
export async function restoreDefaultSettings(
  app: INestApplication,
  prisma: PrismaService,
): Promise<void> {
  await prisma.systemSettingHistory.deleteMany();
  await prisma.systemSetting.deleteMany();
  await setSettings(app, prisma, SETTING_DEFAULTS);
}

export function testPrefix(label: string): string {
  return `test.${label}.${Date.now()}.${Math.random().toString(16).slice(2, 8)}`;
}
