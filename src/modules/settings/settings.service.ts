import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { PrismaService } from "../../prisma/prisma.service";
import { applySettingChange } from "./settings-history";
import { effectiveAdvanceFrom, SETTING_DEFAULTS, SETTINGS_REGISTRY, validateSettingsMap } from "./settings-registry";

const CACHE_TTL_MS = 30_000;

@Injectable()
export class SettingsService {
  private cache: Map<string, unknown> | null = null;
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async get<T>(key: string): Promise<T> {
    if (key === "payout.holdHours") {
      // Deprecated alias: the single money hold is return.windowHours.
      return (await this.ensureCache()).get("return.windowHours") as T;
    }
    return (await this.ensureCache()).get(key) as T;
  }

  async getBoolean(key: string): Promise<boolean> {
    return Boolean(await this.get<unknown>(key));
  }

  async getNumber(key: string): Promise<number> {
    return Number(await this.get<unknown>(key));
  }

  async getAll(): Promise<Record<string, unknown>> {
    const map = await this.ensureCache();
    return {
      ...Object.fromEntries(map),
      "payout.holdHours": map.get("return.windowHours"),
    };
  }

  async getEffectiveAdvance(): Promise<boolean> {
    return effectiveAdvanceFrom(await this.getAll());
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
    const rows = await this.prisma.systemSettingHistory.findMany({
      where: key ? { key } : undefined,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
    const sensitive = new Set(
      SETTINGS_REGISTRY.filter((setting) => setting.isSensitive).map((setting) => setting.key),
    );
    return rows.map((row) =>
      sensitive.has(row.key)
        ? { ...row, oldValue: row.oldValue == null ? null : "•••", newValue: row.newValue == null ? null : "•••" }
        : row,
    );
  }

  async update(
    values: Record<string, unknown>,
    updatedById: string,
    meta?: { reason?: string; ipAddress?: string; userAgent?: string },
  ): Promise<Record<string, unknown>> {
    // Deprecated alias: writes to payout.holdHours drive the single hold setting.
    const normalized = { ...values };
    if ("payout.holdHours" in normalized) {
      if (!("return.windowHours" in normalized)) {
        normalized["return.windowHours"] = normalized["payout.holdHours"];
      }
      delete normalized["payout.holdHours"];
    }
    values = normalized;
    const batchId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.systemSetting.findMany({ select: { key: true, value: true } });
      const current = {
        ...SETTING_DEFAULTS,
        ...Object.fromEntries(rows.map((row) => [row.key, row.value])),
      };
      try {
        validateSettingsMap(values, current);
      } catch (error) {
        const details =
          error && typeof error === "object" && "details" in error
            ? (error as { details?: Record<string, string> }).details
            : undefined;
        throw AppException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          error instanceof Error ? error.message : "Invalid setting",
          details,
        );
      }
      for (const [key, value] of Object.entries(values)) {
        await applySettingChange(
          tx,
          key,
          value,
          updatedById,
          meta,
          SETTING_DEFAULTS[key],
          batchId,
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
