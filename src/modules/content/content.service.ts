import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SettingsService } from "../settings/settings.service";
import { UploadsService } from "../uploads/uploads.service";
import type {
  CreateBannerDto,
  CreateHomepageSectionDto,
  UpdateBannerDto,
  UpdateHomepageSectionDto,
} from "./dto/content.dto";
import {
  HIGHLIGHT_PLACEMENT,
  validateHighlightInput,
  type HighlightInput,
  type HighlightValidationResult,
} from "./highlights.validation";

export interface ContentActor {
  id?: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface PublicHighlightSlide {
  id: string;
  sortOrder: number;
  image: { url: string; width: number | null; height: number | null };
  mobileImage: { url: string; width: number | null; height: number | null } | null;
  alt: { bn: string; en: string };
  focal: { x: number; y: number };
  mobileFocal: { x: number; y: number };
  overlay: {
    enabled: boolean;
    headline: { bn: string; en: string };
    subtext: { bn: string; en: string };
    textColor: string | null;
    scrimColor: string;
    scrimOpacity: number;
    position: { desktop: string; mobile: string };
    align: { desktop: string; mobile: string };
  };
  button: {
    enabled: boolean;
    label: { bn: string; en: string };
    href: string | null;
    style: string;
    backgroundColor: string | null;
    textColor: string | null;
  } | null;
  link: string | null;
  openInNewTab: boolean;
}

const PUBLIC_SELECT = {
  id: true,
  sortOrder: true,
  imageUrl: true,
  imageWidth: true,
  imageHeight: true,
  mobileImageUrl: true,
  mobileImageWidth: true,
  mobileImageHeight: true,
  imageAltBn: true,
  imageAltEn: true,
  focalX: true,
  focalY: true,
  mobileFocalX: true,
  mobileFocalY: true,
  overlayEnabled: true,
  headlineBn: true,
  headlineEn: true,
  subtextBn: true,
  subtextEn: true,
  textColor: true,
  scrimColor: true,
  scrimOpacity: true,
  desktopPosition: true,
  mobilePosition: true,
  desktopAlign: true,
  mobileAlign: true,
  buttonEnabled: true,
  buttonLabelBn: true,
  buttonLabelEn: true,
  buttonHref: true,
  buttonStyle: true,
  buttonBgColor: true,
  buttonTextColor: true,
  linkUrl: true,
  openInNewTab: true,
} satisfies Prisma.BannerSelect;

@Injectable()
export class ContentService {
  private highlightsRows:
    | { rows: Prisma.BannerGetPayload<{ select: typeof PUBLIC_SELECT }>[]; loadedAt: number }
    | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  listBanners(placement?: string) {
    return this.prisma.banner.findMany({
      where: placement ? { placement } : undefined,
      orderBy: [{ placement: "asc" }, { sortOrder: "asc" }],
    });
  }

  async createBanner(dto: CreateBannerDto, actor?: ContentActor) {
    const placement = dto.placement ?? "HOME_HERO";
    const input = dto as HighlightInput;
    const validation = validateHighlightInput(input, await this.dimensionsFor(input, placement));
    await this.assertVisibleLimit({
      placement,
      isActive: dto.isActive ?? true,
      startsAt: validation.startsAt,
      endsAt: validation.endsAt,
    });
    const sortOrder =
      dto.sortOrder ??
      ((await this.prisma.banner.aggregate({
        where: { placement },
        _max: { sortOrder: true },
      }))._max.sortOrder ?? -1) + 1;

    const banner = await this.prisma.$transaction(async (tx) => {
      const created = await tx.banner.create({
        data: this.dataFrom(input, { placement, sortOrder, validation }, actor),
      });
      await this.uploads.attachAssetsInTransaction(tx, this.imageUrls(created));
      return created;
    });
    this.highlightsRows = null;
    await this.record(actor, "banner.create", banner.id, null, banner);
    return { ...banner, warnings: validation.warnings };
  }

  async updateBanner(id: string, dto: UpdateBannerDto, actor?: ContentActor) {
    const existing = await this.ensureBanner(id);
    const merged: HighlightInput = {
      ...(existing as unknown as HighlightInput),
      ...(dto as HighlightInput),
    };
    const placement = dto.placement ?? existing.placement;
    const validation = validateHighlightInput(merged, await this.dimensionsFor(merged, placement));
    await this.assertVisibleLimit({
      placement,
      isActive: dto.isActive ?? existing.isActive,
      startsAt: validation.startsAt,
      endsAt: validation.endsAt,
      excludeId: id,
    });

    const banner = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.banner.update({
        where: { id },
        data: this.dataFrom({ ...merged, ...dto }, {
          placement,
          sortOrder: dto.sortOrder ?? existing.sortOrder,
          validation,
          create: false,
        }, actor),
      });
      await this.uploads.attachAssetsInTransaction(tx, this.imageUrls(updated));
      return updated;
    });
    for (const url of this.imageUrls(existing)) {
      if (!this.imageUrls(banner).includes(url)) {
        await this.deleteImageIfUnreferenced(url);
      }
    }
    this.highlightsRows = null;
    await this.record(actor, "banner.update", id, existing, banner);
    return { ...banner, warnings: validation.warnings };
  }

  async deleteBanner(id: string, actor?: ContentActor): Promise<void> {
    const existing = await this.ensureBanner(id);
    await this.prisma.banner.delete({ where: { id } });
    this.highlightsRows = null;
    for (const url of this.imageUrls(existing)) {
      await this.deleteImageIfUnreferenced(url);
    }
    await this.record(actor, "banner.delete", id, existing, null);
  }

  async duplicateBanner(id: string, actor?: ContentActor) {
    const existing = await this.ensureBanner(id);
    const maxOrder = (await this.prisma.banner.aggregate({
      where: { placement: existing.placement },
      _max: { sortOrder: true },
    }))._max.sortOrder;
    const copy = await this.prisma.banner.create({
      data: {
        ...this.copyData(existing),
        title: existing.title ? `${existing.title} (copy)` : null,
        sortOrder: (maxOrder ?? -1) + 1,
        isActive: false,
        createdById: actor?.id ?? null,
        updatedById: actor?.id ?? null,
      },
    });
    this.highlightsRows = null;
    await this.record(actor, "banner.duplicate", copy.id, existing, copy);
    return copy;
  }

  async reorderBanners(ids: string[], actor?: ContentActor) {
    const unique = [...new Set(ids)];
    const found = await this.prisma.banner.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "One or more banners were not found");
    }
    await this.prisma.$transaction(
      unique.map((id, index) =>
        this.prisma.banner.update({
          where: { id },
          data: { sortOrder: index, updatedById: actor?.id ?? null },
        }),
      ),
    );
    this.highlightsRows = null;
    await this.record(actor, "banner.reorder", null, null, { ids: unique });
    return this.listBanners();
  }

  async publicHighlights() {
    const enabled = await this.settings.getBoolean("home.highlights.enabled");
    const title = await this.settings.get<{ bn?: string; en?: string }>("home.highlights.title");
    const autoplay = await this.settings.getBoolean("home.highlights.autoplay");
    const intervalSeconds = await this.settings.getNumber("home.highlights.intervalSeconds");
    const maxSlides = await this.settings.getNumber("home.highlights.maxSlides");
    if (!enabled) {
      return {
        enabled: false,
        title: { bn: title?.bn ?? "", en: title?.en ?? "" },
        autoplay,
        intervalSeconds,
        slides: [] as PublicHighlightSlide[],
      };
    }
    const rows = await this.activeRows(
      Math.min(Math.max(Number.isFinite(maxSlides) ? maxSlides : 6, 1), 10),
    );
    return {
      enabled: true,
      title: { bn: title?.bn ?? "", en: title?.en ?? "" },
      autoplay,
      intervalSeconds,
      slides: rows.map((row) => this.toPublicSlide(row)),
    };
  }

  /**
   * Short in-process cache of active rows. Settings are read on every call so
   * the feature toggle/autoplay/title apply immediately; schedule boundaries
   * are re-evaluated at least every 15 s. Admin writes clear the cache.
   */
  private async activeRows(limit: number) {
    const now = Date.now();
    if (this.highlightsRows && now - this.highlightsRows.loadedAt < 15_000) {
      return this.highlightsRows.rows.slice(0, limit);
    }
    const at = new Date(now);
    const rows = await this.prisma.banner.findMany({
      where: {
        placement: HIGHLIGHT_PLACEMENT,
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: at } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: at } }] },
        ],
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 10,
      select: PUBLIC_SELECT,
    });
    this.highlightsRows = { rows, loadedAt: now };
    return rows.slice(0, limit);
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

  private dataFrom(
    input: HighlightInput,
    options: {
      placement: string;
      sortOrder: number;
      validation: HighlightValidationResult;
      create?: boolean;
    },
    actor?: ContentActor,
  ): Prisma.BannerUncheckedCreateInput {
    return {
      title: input.title ?? null,
      imageUrl: input.imageUrl,
      linkUrl: input.linkUrl ?? null,
      placement: options.placement,
      sortOrder: options.sortOrder,
      isActive: input.isActive ?? true,
      startsAt: options.validation.startsAt,
      endsAt: options.validation.endsAt,
      imagePublicId: input.imagePublicId ?? null,
      imageWidth: input.imageWidth ?? null,
      imageHeight: input.imageHeight ?? null,
      mobileImageUrl: input.mobileImageUrl ?? null,
      mobileImagePublicId: input.mobileImagePublicId ?? null,
      mobileImageWidth: input.mobileImageWidth ?? null,
      mobileImageHeight: input.mobileImageHeight ?? null,
      imageAltBn: input.imageAltBn ?? null,
      imageAltEn: input.imageAltEn ?? null,
      focalX: input.focalX ?? 50,
      focalY: input.focalY ?? 50,
      mobileFocalX: input.mobileFocalX ?? 50,
      mobileFocalY: input.mobileFocalY ?? 50,
      overlayEnabled: input.overlayEnabled ?? false,
      headlineBn: input.headlineBn ?? null,
      headlineEn: input.headlineEn ?? null,
      subtextBn: input.subtextBn ?? null,
      subtextEn: input.subtextEn ?? null,
      textColor: input.textColor ?? null,
      scrimColor: input.scrimColor ?? "#0B2116",
      scrimOpacity: input.scrimOpacity ?? 35,
      desktopPosition: input.desktopPosition ?? "BOTTOM_LEFT",
      mobilePosition: input.mobilePosition ?? "BOTTOM_LEFT",
      desktopAlign: input.desktopAlign ?? "left",
      mobileAlign: input.mobileAlign ?? "left",
      buttonEnabled: input.buttonEnabled ?? false,
      buttonLabelBn: input.buttonLabelBn ?? null,
      buttonLabelEn: input.buttonLabelEn ?? null,
      buttonHref: input.buttonHref ?? null,
      buttonStyle: input.buttonStyle ?? "primary",
      buttonBgColor: input.buttonBgColor ?? null,
      buttonTextColor: input.buttonTextColor ?? null,
      openInNewTab: input.openInNewTab ?? false,
      ...(options.create !== false ? { createdById: actor?.id ?? null } : {}),
      updatedById: actor?.id ?? null,
    };
  }

  private copyData(existing: Record<string, unknown>) {
    const copy: Record<string, unknown> = { ...existing };
    delete copy.id;
    delete copy.createdAt;
    delete copy.updatedAt;
    delete copy.createdById;
    delete copy.updatedById;
    return copy as Prisma.BannerUncheckedCreateInput;
  }

  private imageUrls(banner: {
    imageUrl?: string | null;
    mobileImageUrl?: string | null;
  }): string[] {
    return [banner.imageUrl, banner.mobileImageUrl].filter(
      (url): url is string => typeof url === "string" && url.trim() !== "",
    );
  }

  private async deleteImageIfUnreferenced(url: string): Promise<void> {
    const stillUsed = await this.prisma.banner.count({
      where: { OR: [{ imageUrl: url }, { mobileImageUrl: url }] },
    });
    if (stillUsed === 0) {
      await this.uploads.deleteByUrl(url);
    }
  }

  private async ensureBanner(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
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

  private async dimensionsFor(input: HighlightInput, placement: string) {
    if (placement !== HIGHLIGHT_PLACEMENT) {
      return {
        desktop: { width: input.imageWidth, height: input.imageHeight },
        mobile: { width: input.mobileImageWidth, height: input.mobileImageHeight },
      };
    }
    const desktop = await this.assertOwnedImage(input.imageUrl, input.imageWidth, input.imageHeight);
    const mobile = input.mobileImageUrl
      ? await this.assertOwnedImage(
          input.mobileImageUrl,
          input.mobileImageWidth,
          input.mobileImageHeight,
        )
      : { width: undefined, height: undefined };
    return { desktop, mobile };
  }

  private async assertOwnedImage(
    url: string,
    fallbackWidth?: number | null,
    fallbackHeight?: number | null,
  ) {
    const asset = await this.prisma.uploadedAsset.findFirst({
      where: { url },
      select: { width: true, height: true },
    });
    if (!asset) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "Highlights images must be uploaded through PlantHaat's uploader",
        { imageUrl: "Upload the image in the slide editor" },
      );
    }
    return {
      width: asset.width ?? fallbackWidth ?? null,
      height: asset.height ?? fallbackHeight ?? null,
    };
  }

  private async assertVisibleLimit(options: {
    placement: string;
    isActive: boolean;
    startsAt: Date | null;
    endsAt: Date | null;
    excludeId?: string;
  }) {
    if (options.placement !== HIGHLIGHT_PLACEMENT || !options.isActive) return;
    const now = new Date();
    const visibleNow =
      (!options.startsAt || options.startsAt <= now) && (!options.endsAt || options.endsAt >= now);
    if (!visibleNow) return;
    const maxSlides = await this.settings.getNumber("home.highlights.maxSlides");
    const count = await this.prisma.banner.count({
      where: {
        placement: HIGHLIGHT_PLACEMENT,
        isActive: true,
        ...(options.excludeId ? { id: { not: options.excludeId } } : {}),
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
    });
    if (count >= Math.min(Math.max(Number.isFinite(maxSlides) ? maxSlides : 6, 1), 10)) {
      throw AppException.conflict(
        ErrorCode.CONFLICT,
        "The maximum number of visible highlights is already active. Hide or schedule another slide first.",
      );
    }
  }

  private toPublicSlide(row: Prisma.BannerGetPayload<{ select: typeof PUBLIC_SELECT }>): PublicHighlightSlide {
    return {
      id: row.id,
      sortOrder: row.sortOrder,
      image: { url: row.imageUrl, width: row.imageWidth, height: row.imageHeight },
      mobileImage: row.mobileImageUrl
        ? {
            url: row.mobileImageUrl,
            width: row.mobileImageWidth,
            height: row.mobileImageHeight,
          }
        : null,
      alt: { bn: row.imageAltBn ?? "", en: row.imageAltEn ?? "" },
      focal: { x: row.focalX, y: row.focalY },
      mobileFocal: { x: row.mobileFocalX, y: row.mobileFocalY },
      overlay: {
        enabled: row.overlayEnabled,
        headline: { bn: row.headlineBn ?? "", en: row.headlineEn ?? "" },
        subtext: { bn: row.subtextBn ?? "", en: row.subtextEn ?? "" },
        textColor: row.textColor,
        scrimColor: row.scrimColor ?? "#0B2116",
        scrimOpacity: row.scrimOpacity,
        position: {
          desktop: row.desktopPosition ?? "BOTTOM_LEFT",
          mobile: row.mobilePosition ?? "BOTTOM_LEFT",
        },
        align: {
          desktop: row.desktopAlign ?? "left",
          mobile: row.mobileAlign ?? "left",
        },
      },
      button: row.buttonEnabled
        ? {
            enabled: true,
            label: { bn: row.buttonLabelBn ?? "", en: row.buttonLabelEn ?? "" },
            href: row.buttonHref,
            style: row.buttonStyle ?? "primary",
            backgroundColor: row.buttonBgColor,
            textColor: row.buttonTextColor,
          }
        : null,
      link: row.linkUrl,
      openInNewTab: row.openInNewTab,
    };
  }

  private async record(
    actor: ContentActor | undefined,
    action: string,
    entityId: string | null,
    before: unknown,
    after: unknown,
  ) {
    if (!actor) return;
    await this.audit.record({
      actorId: actor.id ?? null,
      actorRole: (actor.role as never) ?? null,
      action,
      entityType: "Banner",
      entityId,
      before,
      after,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
    });
  }
}
