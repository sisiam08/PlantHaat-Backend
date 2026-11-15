import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { applySettingChange } from "./settings-history";
import { SETTING_DEFAULTS, SETTINGS_REGISTRY, validateSettingsMap } from "./settings-registry";

const CACHE_TTL_MS = 30_000;

@Injectable()
export class SettingsService {
  private cache: Map<string, unknown> | null = null;
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async get<T>(key: string): Promise<T> {
    return (await this.ensureCache()).get(key) as T;
  }

  async getBoolean(key: string): Promise<boolean> {
    return Boolean(await this.get<unknown>(key));
  }

  async getNumber(key: string): Promise<number> {
    return Number(await this.get<unknown>(key));
  }

  async getAll(): Promise<Record<string, unknown>> {
    return Object.fromEntries(await this.ensureCache());
  }

  getRegistry() {
    return SETTINGS_REGISTRY;
  }

  async getPublic(): Promise<Record<string, unknown>> {
    const all = await this.getAll();
    return Object.fromEntries(
      SETTINGS_REGISTRY.filter((setting) => setting.isPublic).map((setting) => [
        setting.key,
        all[setting.key],
      ]),
    );
  }

  async history(key?: string, limit = 100) {
    return this.prisma.systemSettingHistory.findMany({
      where: key ? { key } : undefined,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  async update(
    values: Record<string, unknown>,
    updatedById: string,
    meta?: { reason?: string; ipAddress?: string; userAgent?: string },
  ): Promise<Record<string, unknown>> {
    try {
      validateSettingsMap(values, Object.fromEntries(await this.ensureCache()));
    } catch (error) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        error instanceof Error ? error.message : "Invalid setting",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        await applySettingChange(
          tx,
          key,
          value,
          updatedById,
          meta,
          SETTING_DEFAULTS[key],
        );
      }
    });
    this.invalidate();
    return this.getAll();
  }

  invalidate(): void {
    this.cache = null;
    this.loadedAt = 0;
  }

  private async ensureCache(): Promise<Map<string, unknown>> {
    if (this.cache && Date.now() - this.loadedAt < CACHE_TTL_MS) {
      return this.cache;
    }
    const rows = await this.prisma.systemSetting.findMany({
      select: { key: true, value: true },
    });
    const map = new Map<string, unknown>(Object.entries(SETTING_DEFAULTS));
    for (const row of rows) map.set(row.key, row.value);
    this.cache = map;
    this.loadedAt = Date.now();
    return map;
  }
}
