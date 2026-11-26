import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { paginate } from "../../common/types/paginated";
import { Prisma } from "../../generated/prisma/client";
import type { CourierQuoteSource, DhakaZone } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { DeliveryQuoteService } from "./delivery-quote.service";

export interface CacheQuery {
  from?: number;
  to?: number;
  source?: CourierQuoteSource;
  stale?: boolean;
  page?: number;
  limit?: number;
}

export interface OverrideRowInput {
  fromSteadfastId: number;
  toSteadfastId: number;
  weightStep: number;
  charge: number;
  available?: boolean;
  lane?: string | null;
}

const DHAKA_DISTRICT = "Dhaka";

@Injectable()
export class AdminDeliveryRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly quotes: DeliveryQuoteService,
  ) {}

  async listCache(query: CacheQuery) {
    const { page, limit, skip } = resolvePagination(query);
    const freshHours = await this.settings.getNumber("delivery.quote.cacheFreshHours");
    const cutoff = new Date(Date.now() - freshHours * 3_600_000);
    const where: Prisma.CourierQuoteCacheWhereInput = {
      ...(query.from ? { fromSteadfastId: query.from } : {}),
      ...(query.to ? { toSteadfastId: query.to } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.stale ? { fetchedAt: { lt: cutoff }, isOverride: false } : {}),
    };
    const [rows, total, locations] = await this.prisma.$transaction([
      this.prisma.courierQuoteCache.findMany({
        where,
        orderBy: [{ fetchedAt: "desc" }, { fromSteadfastId: "asc" }],
        skip,
        take: limit,
      }),
      this.prisma.courierQuoteCache.count({ where }),
      this.prisma.steadfastLocation.findMany({ select: { id: true, name: true } }),
    ]);
    const names = new Map(locations.map((location) => [location.id, location.name]));
    return paginate(
      rows.map((row) => ({
        ...row,
        fromName: names.get(row.fromSteadfastId) ?? null,
        toName: names.get(row.toSteadfastId) ?? null,
        stale: !row.isOverride && row.fetchedAt < cutoff,
      })),
      total,
      page,
      limit,
    );
  }

  async health() {
    const [health, locations, freshHours, fallbackInside, fallbackOutside] =
      await Promise.all([
        this.quotes.health(),
        this.prisma.steadfastLocation.count(),
        this.settings.getNumber("delivery.quote.cacheFreshHours"),
        this.settings.getNumber("delivery.fallback.insideDhaka"),
        this.settings.getNumber("delivery.fallback.outsideDhaka"),
      ]);
    const cutoff = new Date(Date.now() - freshHours * 3_600_000);
    const [cached, stale, overrides] = await Promise.all([
      this.prisma.courierQuoteCache.count({
        where: { isOverride: false, fetchedAt: { gte: cutoff } },
      }),
      this.prisma.courierQuoteCache.count({
        where: { isOverride: false, fetchedAt: { lt: cutoff } },
      }),
      this.prisma.courierQuoteCache.count({ where: { isOverride: true } }),
    ]);
    return {
      ...health,
      locations,
      cached,
      stale,
      overrides,
      freshHours,
      fallbackInside,
      fallbackOutside,
    };
  }

  async mapping() {
    const [districts, thanas, locations] = await Promise.all([
      this.prisma.district.findMany({
        orderBy: [{ division: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          nameBn: true,
          division: true,
          steadfastLocationId: true,
          steadfastLocation: { select: { id: true, name: true, kind: true } },
        },
      }),
      this.prisma.thana.groupBy({ by: ["districtId"], _count: { _all: true } }),
      this.prisma.steadfastLocation.findMany({
        orderBy: { id: "asc" },
        select: { id: true, name: true, kind: true },
      }),
    ]);
    const counts = new Map(thanas.map((row) => [row.districtId, row._count._all]));
    const rows = districts.map((district) => ({
      ...district,
      isDhaka: district.name === DHAKA_DISTRICT,
      thanaCount: counts.get(district.id) ?? 0,
      // Dhaka is intentionally unmapped at district level (thana decides 1/18).
      mapped:
        district.name === DHAKA_DISTRICT || district.steadfastLocationId !== null,
    }));
    return { districts: rows, locations };
  }

  async updateMapping(districtId: number, steadfastLocationId: number | null) {
    const district = await this.prisma.district.findUnique({
      where: { id: districtId },
      select: { id: true, name: true },
    });
    if (!district) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "District not found");
    }
    if (district.name === DHAKA_DISTRICT) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "Dhaka is mapped per thana (City/Sub-Urban); edit the thana zones instead",
      );
    }
    if (steadfastLocationId !== null) {
      const location = await this.prisma.steadfastLocation.findUnique({
        where: { id: steadfastLocationId },
        select: { id: true },
      });
      if (!location) {
        throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Unknown Steadfast location");
      }
    }
    return this.prisma.district.update({
      where: { id: districtId },
      data: { steadfastLocationId },
      select: { id: true, name: true, steadfastLocationId: true },
    });
  }

  async listThanas(districtId?: number) {
    const targetDistrict =
      districtId ??
      (
        await this.prisma.district.findFirst({
          where: { name: DHAKA_DISTRICT },
          select: { id: true },
        })
      )?.id;
    if (!targetDistrict) {
      return [];
    }
    const thanas = await this.prisma.thana.findMany({
      where: { districtId: targetDistrict },
      orderBy: [{ dhakaZone: "asc" }, { name: "asc" }],
      include: { district: { select: { id: true, name: true } } },
    });
    return thanas;
  }

  async updateThana(
    id: string,
    input: {
      dhakaZone?: DhakaZone | null;
      nameBn?: string | null;
      isActive?: boolean;
      selectableByCustomer?: boolean;
    },
  ) {
    const thana = await this.prisma.thana.findUnique({
      where: { id },
      select: { id: true, district: { select: { name: true } } },
    });
    if (!thana) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Thana not found");
    }
    if (thana.district.name !== DHAKA_DISTRICT && input.dhakaZone !== undefined) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "Only Dhaka thanas have a City/Sub-Urban zone",
      );
    }
    return this.prisma.thana.update({
      where: { id },
      data: {
        ...(input.dhakaZone !== undefined ? { dhakaZone: input.dhakaZone } : {}),
        ...(input.nameBn !== undefined ? { nameBn: input.nameBn } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.selectableByCustomer !== undefined
          ? { selectableByCustomer: input.selectableByCustomer }
          : {}),
        classificationSource: "ADMIN_VERIFIED",
      },
    });
  }

  listOverrides() {
    return this.quotes.listOverrides();
  }

  createOrUpdateOverride(input: OverrideRowInput) {
    return this.quotes.upsertOverride(input);
  }

  async deleteOverride(id: string) {
    await this.quotes.removeOverride(id);
  }

  async exportOverridesCsv(): Promise<string> {
    const rows = await this.quotes.listOverrides();
    const header = "from,to,weightStep,charge,available,lane";
    const body = rows.map((row) =>
      [
        row.fromSteadfastId,
        row.toSteadfastId,
        row.weightStep.toString(),
        row.charge?.toString() ?? "",
        row.available ? "true" : "false",
        row.lane ?? "",
      ].join(","),
    );
    return [header, ...body].join("\n");
  }

  async importOverridesCsv(csv: string, dryRun: boolean) {
    const lines = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const locations = await this.prisma.steadfastLocation.findMany({
      select: { id: true },
    });
    const validIds = new Set(locations.map((location) => location.id));
    const parsed: (OverrideRowInput & { line: number })[] = [];
    const errors: { line: number; error: string }[] = [];

    for (const [index, line] of lines.entries()) {
      if (index === 0 && /from/i.test(line) && /to/i.test(line)) {
        continue;
      }
      const parts = line.split(",").map((part) => part.trim());
      if (parts.length < 4) {
        errors.push({ line: index + 1, error: "Expected from,to,weightStep,charge" });
        continue;
      }
      const from = Number(parts[0]);
      const to = Number(parts[1]);
      const weightStep = Number(parts[2]);
      const charge = Number(parts[3]);
      if (!validIds.has(from)) {
        errors.push({ line: index + 1, error: `Unknown from id ${parts[0]}` });
        continue;
      }
      if (!validIds.has(to)) {
        errors.push({ line: index + 1, error: `Unknown to id ${parts[1]}` });
        continue;
      }
      if (!Number.isFinite(weightStep) || weightStep < 0.01 || weightStep > 600) {
        errors.push({ line: index + 1, error: "Weight must be 0.01-600" });
        continue;
      }
      if (!Number.isFinite(charge) || charge < 0) {
        errors.push({ line: index + 1, error: "Charge must be 0 or more" });
        continue;
      }
      const available =
        parts[4] === undefined || parts[4] === ""
          ? true
          : parts[4].toLowerCase() === "true";
      parsed.push({
        line: index + 1,
        fromSteadfastId: from,
        toSteadfastId: to,
        weightStep,
        charge,
        available,
        lane: parts[5] || null,
      });
    }

    if (dryRun) {
      return { dryRun: true, valid: parsed.length, errors, rows: parsed };
    }
    for (const row of parsed) {
      await this.quotes.upsertOverride(row);
    }
    return { dryRun: false, imported: parsed.length, errors };
  }

  warmUp(shopId: string) {
    return this.quotes.warmUpPickup(shopId);
  }
}



