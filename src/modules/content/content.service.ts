import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import type {
  CreateBannerDto,
  CreateHomepageSectionDto,
  UpdateBannerDto,
  UpdateHomepageSectionDto,
} from "./dto/content.dto";

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  listBanners() {
    return this.prisma.banner.findMany({ orderBy: [{ placement: "asc" }, { sortOrder: "asc" }] });
  }

  async createBanner(dto: CreateBannerDto) {
    const banner = await this.prisma.$transaction(async (tx) => {
      const created = await tx.banner.create({
        data: {
          title: dto.title ?? null,
          imageUrl: dto.imageUrl,
          linkUrl: dto.linkUrl ?? null,
          placement: dto.placement ?? "HOME_HERO",
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        },
      });
      await this.uploads.attachAssetsInTransaction(tx, [created.imageUrl]);
      return created;
    });
    return banner;
  }

  async updateBanner(id: string, dto: UpdateBannerDto) {
    const existing = await this.ensureBanner(id);
    const banner = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.banner.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
          ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl } : {}),
          ...(dto.placement !== undefined ? { placement: dto.placement } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.startsAt !== undefined
            ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null }
            : {}),
          ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
        },
      });
      await this.uploads.attachAssetsInTransaction(tx, [updated.imageUrl]);
      return updated;
    });
    if (existing.imageUrl && existing.imageUrl !== banner.imageUrl) {
      await this.uploads.deleteByUrl(existing.imageUrl);
    }
    return banner;
  }

  async deleteBanner(id: string): Promise<void> {
    const existing = await this.ensureBanner(id);
    await this.prisma.banner.delete({ where: { id } });
    await this.uploads.deleteByUrl(existing.imageUrl);
  }

  listSections() {
    return this.prisma.homepageSection.findMany({ orderBy: { sortOrder: "asc" } });
  }

  async createSection(dto: CreateHomepageSectionDto) {
    const existing = await this.prisma.homepageSection.findUnique({
      where: { key: dto.key },
      select: { id: true },
    });
    if (existing) {
      throw AppException.conflict(ErrorCode.CONFLICT, "A section with this key already exists");
    }
    return this.prisma.homepageSection.create({
      data: {
        key: dto.key,
        title: dto.title,
        titleBn: dto.titleBn ?? null,
        type: dto.type,
        itemIds: dto.itemIds ?? [],
        config: (dto.config ?? undefined) as Prisma.InputJsonValue | undefined,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateSection(id: string, dto: UpdateHomepageSectionDto) {
    await this.ensureSection(id);
    return this.prisma.homepageSection.update({
      where: { id },
      data: {
        ...(dto.key !== undefined ? { key: dto.key } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.titleBn !== undefined ? { titleBn: dto.titleBn } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.itemIds !== undefined ? { itemIds: dto.itemIds } : {}),
        ...(dto.config !== undefined ? { config: dto.config as Prisma.InputJsonValue } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async deleteSection(id: string): Promise<void> {
    await this.ensureSection(id);
    await this.prisma.homepageSection.delete({ where: { id } });
  }

  private async ensureBanner(id: string) {
    const banner = await this.prisma.banner.findUnique({
      where: { id },
      select: { id: true, imageUrl: true },
    });
    if (!banner) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Banner not found");
    }
    return banner;
  }

  private async ensureSection(id: string): Promise<void> {
    const section = await this.prisma.homepageSection.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!section) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Section not found");
    }
  }
}
