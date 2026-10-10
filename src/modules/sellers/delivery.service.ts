import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateDeliveryZoneDto } from "./dto/create-delivery-zone.dto";
import type { UpdateDeliveryZoneDto } from "./dto/update-delivery-zone.dto";
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

  async create(userId: string, dto: CreateDeliveryZoneDto) {
    const { shop } = await this.sellerContext.requireShop(userId);
    const isNationwide = dto.isNationwide ?? false;
    const districtIds = isNationwide ? [] : (dto.districtIds ?? []);

    if (!isNationwide && districtIds.length === 0) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "Select at least one district or enable nationwide delivery",
      );
    }
    await this.assertDistricts(districtIds);
    if (!isNationwide) {
      await this.assertNoOverlap(shop.id, districtIds);
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
        districts: { create: districtIds.map((districtId) => ({ districtId })) },
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
    const districtIds = dto.districtIds;

    if (isNationwide && dto.isNationwide === true) {
      // switching to nationwide clears districts
    } else if (districtIds !== undefined) {
      await this.assertDistricts(districtIds);
      await this.assertNoOverlap(shop.id, districtIds, zoneId);
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
      } else if (districtIds !== undefined) {
        await tx.zoneDistrict.deleteMany({ where: { zoneId } });
        await tx.zoneDistrict.createMany({
          data: districtIds.map((districtId) => ({ zoneId, districtId })),
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
    districtIds: number[],
    excludeZoneId?: string,
  ): Promise<void> {
    if (districtIds.length === 0) {
      return;
    }
    const conflicting = await this.prisma.zoneDistrict.findFirst({
      where: {
        districtId: { in: districtIds },
        zone: {
          shopId,
          isActive: true,
          ...(excludeZoneId ? { id: { not: excludeZoneId } } : {}),
        },
      },
      select: { districtId: true },
    });
    if (conflicting) {
      throw AppException.conflict(
        ErrorCode.DELIVERY_ZONE_CONFLICT,
        "A selected district is already covered by another active zone",
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
  districts: { district: { id: number; name: string; nameBn: string; division: string } }[];
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
    districts: zone.districts.map((link) => link.district),
    createdAt: zone.createdAt,
  };
}
