import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { DeliveryCondition } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateDeliveryZoneDto } from "./dto/create-delivery-zone.dto";
import type { UpdateDeliveryZoneDto } from "./dto/update-delivery-zone.dto";
import type { UpsertDeliveryConditionDto } from "./dto/upsert-delivery-condition.dto";
import { SellerContextService } from "./seller-context.service";

const ZONE_INCLUDE = {
  districts: {
    include: {
      district: { select: { id: true, name: true, nameBn: true, division: true } },
    },
  },
} as const;

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellerContext: SellerContextService,
  ) {}

  async listForSeller(userId: string) {
    const { shop } = await this.sellerContext.requireShop(userId);
    const zones = await this.prisma.shopDeliveryZone.findMany({
      where: { shopId: shop.id },
      include: ZONE_INCLUDE,
      orderBy: { createdAt: "asc" },
    });
    return zones.map(toZoneView);
  }

  async listConditions(userId: string) {
    const { shop } = await this.sellerContext.requireShop(userId);
    const rows = await this.prisma.shopDeliveryZone.findMany({
      where: { shopId: shop.id, condition: { not: null } },
      orderBy: { condition: "asc" },
    });
    const byCondition = new Map(rows.map((row) => [row.condition, row]));
    const legacy = await this.prisma.shopDeliveryZone.findFirst({
      where: { shopId: shop.id, isActive: true },
      orderBy: { charge: "asc" },
    });
    return (["INSIDE_DHAKA", "OUTSIDE_DHAKA"] as const).map((condition) => {
      const row = byCondition.get(condition);
      return {
        id: row?.id ?? null,
        condition,
        charge: row?.charge ?? legacy?.charge ?? "0",
        freeDeliveryAbove: row?.freeDeliveryAbove ?? legacy?.freeDeliveryAbove ?? null,
        estimatedDaysMin: row?.estimatedDaysMin ?? legacy?.estimatedDaysMin ?? 1,
        estimatedDaysMax: row?.estimatedDaysMax ?? legacy?.estimatedDaysMax ?? 3,
        paymentMode: row?.paymentMode ?? "COD_AND_ADVANCE",
        freeDeliveryEnabled: row?.freeDeliveryEnabled ?? false,
        isActive: row?.isActive ?? true,
        configured: Boolean(row),
      };
    });
  }

  async upsertCondition(
    userId: string,
    condition: DeliveryCondition,
    dto: UpsertDeliveryConditionDto,
  ) {
    const { shop } = await this.sellerContext.requireShop(userId);
    const existing = await this.prisma.shopDeliveryZone.findFirst({
      where: { shopId: shop.id, condition },
    });
    const data = {
      name: condition === "INSIDE_DHAKA" ? "Inside Dhaka" : "Outside Dhaka",
      isNationwide: true,
      charge: dto.charge ?? existing?.charge ?? 0,
      freeDeliveryAbove: dto.freeDeliveryAbove ?? null,
      freeDeliveryEnabled: dto.freeDeliveryEnabled ?? existing?.freeDeliveryEnabled ?? false,
      estimatedDaysMin: dto.estimatedDaysMin ?? 1,
      estimatedDaysMax: dto.estimatedDaysMax ?? 3,
      paymentMode: dto.paymentMode,
      isActive: dto.isActive ?? true,
    };
    const row = existing
      ? await this.prisma.shopDeliveryZone.update({ where: { id: existing.id }, data })
      : await this.prisma.shopDeliveryZone.create({
          data: { ...data, shopId: shop.id, condition },
        });
    return {
      id: row.id,
      condition: row.condition,
      charge: row.charge,
      freeDeliveryAbove: row.freeDeliveryAbove,
      estimatedDaysMin: row.estimatedDaysMin,
      estimatedDaysMax: row.estimatedDaysMax,
      paymentMode: row.paymentMode,
      freeDeliveryEnabled: row.freeDeliveryEnabled,
      isActive: row.isActive,
      configured: true,
    };
  }

  async create(userId: string, dto: CreateDeliveryZoneDto) {
    const { shop } = await this.sellerContext.requireShop(userId);
    const isNationwide = dto.isNationwide ?? false;
    const entries = isNationwide
      ? []
      : (dto.districtAreaScopes ??
        (dto.districtIds ?? []).map((districtId) => ({
          districtId,
          areaScope: "ALL" as const,
        })));

    if (!isNationwide && entries.length === 0) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "Select at least one district or enable nationwide delivery",
      );
    }
    await this.assertDistricts(entries.map((entry) => entry.districtId));
    if (!isNationwide) {
      await this.assertNoOverlap(shop.id, entries);
    }

    const zone = await this.prisma.shopDeliveryZone.create({
      data: {
        shopId: shop.id,
        name: dto.name.trim(),
        isNationwide,
        charge: dto.charge,
        freeDeliveryAbove: dto.freeDeliveryAbove ?? null,
        estimatedDaysMin: dto.estimatedDaysMin ?? 1,
        estimatedDaysMax: dto.estimatedDaysMax ?? 3,
        districts: {
          create: entries.map((entry) => ({
            districtId: entry.districtId,
            areaScope: entry.areaScope,
          })),
        },
      },
      include: ZONE_INCLUDE,
    });
    return toZoneView(zone);
  }

  async update(userId: string, zoneId: string, dto: UpdateDeliveryZoneDto) {
    const { shop } = await this.sellerContext.requireShop(userId);
    const zone = await this.prisma.shopDeliveryZone.findFirst({
      where: { id: zoneId, shopId: shop.id },
    });
    if (!zone) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Delivery zone not found");
    }

    const isNationwide = dto.isNationwide ?? zone.isNationwide;
    const entries =
      dto.districtAreaScopes ??
      (dto.districtIds !== undefined
        ? dto.districtIds.map((districtId) => ({
            districtId,
            areaScope: "ALL" as const,
          }))
        : undefined);

    if (isNationwide && dto.isNationwide === true) {
      // switching to nationwide clears districts
    } else if (entries !== undefined) {
      await this.assertDistricts(entries.map((entry) => entry.districtId));
      await this.assertNoOverlap(shop.id, entries, zoneId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.shopDeliveryZone.update({
        where: { id: zoneId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.isNationwide !== undefined ? { isNationwide: dto.isNationwide } : {}),
          ...(dto.charge !== undefined ? { charge: dto.charge } : {}),
          ...(dto.freeDeliveryAbove !== undefined
            ? { freeDeliveryAbove: dto.freeDeliveryAbove }
            : {}),
          ...(dto.estimatedDaysMin !== undefined ? { estimatedDaysMin: dto.estimatedDaysMin } : {}),
          ...(dto.estimatedDaysMax !== undefined ? { estimatedDaysMax: dto.estimatedDaysMax } : {}),
        },
      });

      if (dto.isNationwide === true) {
        await tx.zoneDistrict.deleteMany({ where: { zoneId } });
      } else if (entries !== undefined) {
        await tx.zoneDistrict.deleteMany({ where: { zoneId } });
        await tx.zoneDistrict.createMany({
          data: entries.map((entry) => ({
            zoneId,
            districtId: entry.districtId,
            areaScope: entry.areaScope,
          })),
        });
      }
    });

    const updated = await this.prisma.shopDeliveryZone.findUniqueOrThrow({
      where: { id: zoneId },
      include: ZONE_INCLUDE,
    });
    return toZoneView(updated);
  }

  async remove(userId: string, zoneId: string): Promise<void> {
    const { shop } = await this.sellerContext.requireShop(userId);
    const zone = await this.prisma.shopDeliveryZone.findFirst({
      where: { id: zoneId, shopId: shop.id },
      select: { id: true },
    });
    if (!zone) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Delivery zone not found");
    }
    await this.prisma.shopDeliveryZone.delete({ where: { id: zoneId } });
  }

  private async assertDistricts(districtIds: number[]): Promise<void> {
    if (districtIds.length === 0) {
      return;
    }
    const count = await this.prisma.district.count({ where: { id: { in: districtIds } } });
    if (count !== districtIds.length) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "One or more districts are invalid",
      );
    }
  }

  private async assertNoOverlap(
    shopId: string,
    entries: { districtId: number; areaScope: "ALL" | "CITY" | "OUTSIDE" }[],
    excludeZoneId?: string,
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    const districts = [...new Set(entries.map((entry) => entry.districtId))];
    const scopes = [...new Set(entries.map((entry) => entry.areaScope))];
    const conflicting = await this.prisma.zoneDistrict.findFirst({
      where: {
        districtId: { in: districts },
        areaScope: { in: scopes },
        zone: {
          shopId,
          isActive: true,
          ...(excludeZoneId ? { id: { not: excludeZoneId } } : {}),
        },
      },
      select: { districtId: true, areaScope: true },
    });
    if (conflicting) {
      throw AppException.conflict(
        ErrorCode.DELIVERY_ZONE_CONFLICT,
        "A selected district/area scope is already covered by another active zone",
      );
    }
  }
}

interface ZoneRow {
  id: string;
  name: string;
  isNationwide: boolean;
  charge: unknown;
  freeDeliveryAbove: unknown;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
  isActive: boolean;
  createdAt: Date;
  districts: {
    areaScope: "ALL" | "CITY" | "OUTSIDE";
    district: { id: number; name: string; nameBn: string; division: string };
  }[];
}

function toZoneView(zone: ZoneRow) {
  return {
    id: zone.id,
    name: zone.name,
    isNationwide: zone.isNationwide,
    charge: zone.charge,
    freeDeliveryAbove: zone.freeDeliveryAbove,
    estimatedDaysMin: zone.estimatedDaysMin,
    estimatedDaysMax: zone.estimatedDaysMax,
    isActive: zone.isActive,
    districts: zone.districts.map((link) => ({
      ...link.district,
      areaScope: link.areaScope,
    })),
    createdAt: zone.createdAt,
  };
}

