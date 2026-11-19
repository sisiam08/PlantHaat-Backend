import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { toUniqueSlug } from "../../common/utils/slug";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import type { SetVacationDto } from "./dto/set-vacation.dto";
import type { UpdateShopDto } from "./dto/update-shop.dto";
import { SellerContextService } from "./seller-context.service";

@Injectable()
export class ShopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellerContext: SellerContextService,
    private readonly uploads: UploadsService,
  ) {}

  async getForSeller(userId: string) {
    const profile = await this.sellerContext.requireProfile(userId);
    const shop = profile.shops[0];
    if (!shop) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Shop not found");
    }
    return this.toView(shop);
  }

  async upsertForSeller(userId: string, dto: UpdateShopDto) {
    const profile = await this.sellerContext.requireProfile(userId);
    const existing = profile.shops[0];

    if (!existing) {
      if (!dto.name) {
        throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Shop name is required");
      }
      const slug = await this.generateUniqueSlug(dto.name);
      const shop = await this.prisma.$transaction(async (tx) => {
        const created = await tx.shop.create({
          data: {
            sellerProfileId: profile.id,
            name: dto.name!.trim(),
            slug,
            description: dto.description ?? null,
            logoUrl: dto.logoUrl ?? null,
            bannerUrl: dto.bannerUrl ?? null,
            phone: dto.phone ?? null,
            district: dto.district ?? null,
            address: dto.address ?? null,
            latitude: dto.latitude ?? null,
            longitude: dto.longitude ?? null,
            status: "PENDING",
          },
        });
        await this.uploads.attachAssetsInTransaction(tx, [created.logoUrl, created.bannerUrl]);
        return created;
      });
      return this.toView(shop);
    }

    const data: Prisma.ShopUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    if (dto.bannerUrl !== undefined) data.bannerUrl = dto.bannerUrl;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.district !== undefined) data.district = dto.district;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;

    const shop = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.shop.update({ where: { id: existing.id }, data });
      await this.uploads.attachAssetsInTransaction(tx, [updated.logoUrl, updated.bannerUrl]);
      return updated;
    });
    if (existing.logoUrl && existing.logoUrl !== shop.logoUrl) {
      await this.uploads.deleteByUrl(existing.logoUrl);
    }
    if (existing.bannerUrl && existing.bannerUrl !== shop.bannerUrl) {
      await this.uploads.deleteByUrl(existing.bannerUrl);
    }
    return this.toView(shop);
  }

  async setVacation(userId: string, dto: SetVacationDto) {
    const { shop } = await this.sellerContext.requireShop(userId);
    const updated = await this.prisma.shop.update({
      where: { id: shop.id },
      data: {
        isOnVacation: true,
        vacationUntil: dto.until ? new Date(dto.until) : null,
        vacationMessage: dto.message ?? null,
      },
    });
    return this.toView(updated);
  }

  async clearVacation(userId: string) {
    const { shop } = await this.sellerContext.requireShop(userId);
    const updated = await this.prisma.shop.update({
      where: { id: shop.id },
      data: { isOnVacation: false, vacationUntil: null, vacationMessage: null },
    });
    return this.toView(updated);
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = toUniqueSlug(name);
      const existing = await this.prisma.shop.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!existing) {
        return slug;
      }
    }
    throw AppException.internal("Could not generate a unique shop slug");
  }

  private toView(shop: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    phone: string | null;
    district: string | null;
    address: string | null;
    latitude: Prisma.Decimal | null;
    longitude: Prisma.Decimal | null;
    status: string;
    isOnVacation: boolean;
    vacationUntil: Date | null;
    vacationMessage: string | null;
    ratingAvg: Prisma.Decimal;
    ratingCount: number;
    approvedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: shop.id,
      name: shop.name,
      slug: shop.slug,
      description: shop.description,
      logoUrl: shop.logoUrl,
      bannerUrl: shop.bannerUrl,
      phone: shop.phone,
      district: shop.district,
      address: shop.address,
      latitude: shop.latitude,
      longitude: shop.longitude,
      status: shop.status,
      isOnVacation: shop.isOnVacation,
      vacationUntil: shop.vacationUntil,
      vacationMessage: shop.vacationMessage,
      ratingAvg: shop.ratingAvg,
      ratingCount: shop.ratingCount,
      approvedAt: shop.approvedAt,
      createdAt: shop.createdAt,
    };
  }
}
