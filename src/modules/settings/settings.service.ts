import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export const SETTING_DEFAULTS: Record<string, unknown> = {
  "commission.default": 10,
  "product.autoApprove": true,
  "order.sellerConfirmTimeoutHours": 48,
  "complaint.windowHours": 48,
  "review.windowDays": 60,
  "checkout.maxQtyPerItem": 20,
  "payments.online.enabled": false,
  "shop.maxPerSeller": 1,
};

const CACHE_TTL_MS = 30_000;

@Injectable()
export class SettingsService {
  private cache: Map<string, unknown> | null = null;
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async get<T>(key: string): Promise<T> {
    const cache = await this.ensureCache();
    return cache.get(key) as T;
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

  async update(
    values: Record<string, unknown>,
    updatedById: string,
  ): Promise<Record<string, unknown>> {
    const allowed = new Set(Object.keys(SETTING_DEFAULTS));
    for (const key of Object.keys(values)) {
      if (!allowed.has(key)) {
        throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, `Unknown setting: ${key}`);
      }
    }
    await this.prisma.$transaction(
      Object.entries(values).map(([key, value]) =>
        this.prisma.systemSetting.upsert({
          where: { key },
          update: { value: value as Prisma.InputJsonValue, updatedById },
          create: { key, value: value as Prisma.InputJsonValue, updatedById },
        }),
      ),
    );
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
    for (const row of rows) {
      map.set(row.key, row.value);
    }
    this.cache = map;
    this.loadedAt = Date.now();
    return map;
  }
}
