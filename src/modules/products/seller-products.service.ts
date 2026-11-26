import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import { toUniqueSlug } from "../../common/utils/slug";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SellerContextService } from "../sellers/seller-context.service";
import { SettingsService } from "../settings/settings.service";
import { UploadsService } from "../uploads/uploads.service";
import type { AdjustStockDto } from "./dto/adjust-stock.dto";
import type { CreateProductDto } from "./dto/create-product.dto";
import type { CreateVariantDto } from "./dto/create-variant.dto";
import type { SetProductStatusDto } from "./dto/set-product-status.dto";
import type { UpdateProductDto } from "./dto/update-product.dto";
import type { UpdateVariantDto } from "./dto/update-variant.dto";
import { recomputeProductAggregates } from "./product-aggregates";

const MAX_IMAGES = 8;

const PRODUCT_DETAIL_INCLUDE = {
  variants: { orderBy: { sortOrder: "asc" } },
  images: { orderBy: { sortOrder: "asc" } },
  category: { select: { id: true, name: true, nameBn: true, slug: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class SellerProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sellerContext: SellerContextService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadsService,
    private readonly events: EventEmitter2,
  ) {}

  async list(userId: string): Promise<PaginatedResult<unknown>> {
    const { shop } = await this.sellerContext.requireShop(userId);
    const products = await this.prisma.product.findMany({
      where: { shopId: shop.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        variants: { select: { id: true, price: true, stockQty: true, isActive: true } },
        images: { select: { id: true, url: true, isPrimary: true } },
        category: { select: { id: true, name: true, slug: true } },
      },
    });
    const { page, limit } = resolvePagination({});
    return paginate(products, products.length, page, limit);
  }

  async get(userId: string, productId: string) {
    return this.toView(await this.getOwned(userId, productId));
  }

  async create(userId: string, dto: CreateProductDto) {
    const { shop } = await this.sellerContext.requireShop(userId);
    await this.assertCategory(dto.categoryId);

    const product = await this.prisma.product.create({
      data: {
        shopId: shop.id,
        categoryId: dto.categoryId,
        name: dto.name.trim(),
        nameBn: dto.nameBn ?? null,
        scientificName: dto.scientificName ?? null,
        description: dto.description,
        careInstructions: dto.careInstructions ?? null,
        lightRequirement: dto.lightRequirement ?? null,
        wateringFrequency: dto.wateringFrequency ?? null,
        careDifficulty: dto.careDifficulty ?? null,
        isIndoor: dto.isIndoor ?? null,
        isPetSafe: dto.isPetSafe ?? null,
        matureHeightCm: dto.matureHeightCm ?? null,
        tags: dto.tags ?? [],
        careDetails: (dto.careDetails ?? undefined) as Prisma.InputJsonValue | undefined,
        weightKg: dto.weightKg ?? null,
        extraChargeAfterQty: dto.extraChargeAfterQty ?? null,
        extraChargePerUnit: dto.extraChargePerUnit ?? null,
        slug: await this.generateUniqueSlug(dto.name),
        status: "DRAFT",
      },
      include: PRODUCT_DETAIL_INCLUDE,
    });
    this.events.emit("product.changed");
    return this.toView(product);
  }

  async update(userId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.getOwned(userId, productId);
    if (dto.categoryId !== undefined) {
      await this.assertCategory(dto.categoryId);
    }

    const data: Prisma.ProductUpdateInput = {};
    if (dto.categoryId !== undefined) data.category = { connect: { id: dto.categoryId } };
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.nameBn !== undefined) data.nameBn = dto.nameBn;
    if (dto.scientificName !== undefined) data.scientificName = dto.scientificName;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.careInstructions !== undefined) data.careInstructions = dto.careInstructions;
    if (dto.lightRequirement !== undefined) data.lightRequirement = dto.lightRequirement;
    if (dto.wateringFrequency !== undefined) data.wateringFrequency = dto.wateringFrequency;
    if (dto.careDifficulty !== undefined) data.careDifficulty = dto.careDifficulty;
    if (dto.isIndoor !== undefined) data.isIndoor = dto.isIndoor;
    if (dto.isPetSafe !== undefined) data.isPetSafe = dto.isPetSafe;
    if (dto.matureHeightCm !== undefined) data.matureHeightCm = dto.matureHeightCm;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.weightKg !== undefined) data.weightKg = dto.weightKg;
    if (dto.extraChargeAfterQty !== undefined)
      data.extraChargeAfterQty = dto.extraChargeAfterQty;
    if (dto.extraChargePerUnit !== undefined)
      data.extraChargePerUnit = dto.extraChargePerUnit;
    if (dto.careDetails !== undefined) {
      data.careDetails = dto.careDetails as Prisma.InputJsonValue;
    }

    const contentChanged =
      dto.name !== undefined ||
      dto.nameBn !== undefined ||
      dto.scientificName !== undefined ||
      dto.description !== undefined;

    const autoApprove = await this.settings.getBoolean("product.autoApprove");
    if (!autoApprove && contentChanged && product.status === "ACTIVE") {
      data.status = "PENDING_REVIEW";
    }

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data,
      include: PRODUCT_DETAIL_INCLUDE,
    });
    this.events.emit("product.changed");
    return this.toView(updated);
  }

  async setStatus(userId: string, productId: string, dto: SetProductStatusDto) {
    const product = await this.getOwned(userId, productId);

    if (dto.status === "INACTIVE") {
      if (product.status !== "ACTIVE") {
        throw AppException.badRequest(
          ErrorCode.INVALID_STATUS_TRANSITION,
          "Only an active product can be deactivated",
        );
      }
      const updated = await this.prisma.product.update({
        where: { id: productId },
        data: { status: "INACTIVE" },
        include: PRODUCT_DETAIL_INCLUDE,
      });
      this.events.emit("product.changed");
      return this.toView(updated);
    }

    const imageCount = await this.prisma.productImage.count({ where: { productId } });
    if (imageCount === 0) {
      throw AppException.badRequest(ErrorCode.IMAGE_REQUIRED, "Add at least one image first");
    }
    const activeVariants = await this.prisma.productVariant.count({
      where: { productId, isActive: true },
    });
    if (activeVariants === 0) {
      throw AppException.badRequest(
        ErrorCode.VARIANT_UNAVAILABLE,
        "Add at least one active variant first",
      );
    }

    const autoApprove = await this.settings.getBoolean("product.autoApprove");
    const nextStatus = autoApprove ? "ACTIVE" : "PENDING_REVIEW";
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        status: nextStatus,
        ...(nextStatus === "ACTIVE" ? { publishedAt: new Date() } : {}),
      },
      include: PRODUCT_DETAIL_INCLUDE,
    });
    this.events.emit("product.changed");
    return this.toView(updated);
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.getOwned(userId, productId);
    await this.prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date(), status: "INACTIVE" },
    });
    this.events.emit("product.changed");
  }

  async addVariant(userId: string, productId: string, dto: CreateVariantDto) {
    await this.getOwned(userId, productId);
    const stockQty = dto.stockQty ?? 0;

    await this.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data: {
          productId,
          name: dto.name.trim(),
          sku: dto.sku ?? null,
          sizeLabel: dto.sizeLabel ?? null,
          heightCm: dto.heightCm ?? null,
          potType: dto.potType ?? null,
          potSizeInch: dto.potSizeInch ?? null,
          price: dto.price,
          compareAtPrice: dto.compareAtPrice ?? null,
          stockQty,
          lowStockThreshold: dto.lowStockThreshold ?? 3,
          weightGrams: dto.weightGrams ?? null,
          isActive: dto.isActive ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      if (stockQty > 0) {
        await tx.inventoryLog.create({
          data: {
            variantId: variant.id,
            delta: stockQty,
            stockAfter: stockQty,
            reason: "INITIAL",
          },
        });
      }
      await recomputeProductAggregates(tx, productId);
    });

    this.events.emit("product.changed");
    return this.get(userId, productId);
  }

  async updateVariant(userId: string, productId: string, variantId: string, dto: UpdateVariantDto) {
    await this.getOwned(userId, productId);
    const variant = await this.getVariant(productId, variantId);

    if (dto.isActive === false && variant.isActive) {
      const otherActive = await this.prisma.productVariant.count({
        where: { productId, isActive: true, id: { not: variantId } },
      });
      if (otherActive === 0) {
        throw AppException.badRequest(
          ErrorCode.VARIANT_UNAVAILABLE,
          "A product must keep at least one active variant",
        );
      }
    }

    const data: Prisma.ProductVariantUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.sku !== undefined) data.sku = dto.sku;
    if (dto.sizeLabel !== undefined) data.sizeLabel = dto.sizeLabel;
    if (dto.heightCm !== undefined) data.heightCm = dto.heightCm;
    if (dto.potType !== undefined) data.potType = dto.potType;
    if (dto.potSizeInch !== undefined) data.potSizeInch = dto.potSizeInch;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.compareAtPrice !== undefined) data.compareAtPrice = dto.compareAtPrice;
    if (dto.lowStockThreshold !== undefined) data.lowStockThreshold = dto.lowStockThreshold;
    if (dto.weightGrams !== undefined) data.weightGrams = dto.weightGrams;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    await this.prisma.$transaction(async (tx) => {
      await tx.productVariant.update({ where: { id: variantId }, data });
      await recomputeProductAggregates(tx, productId);
    });
    this.events.emit("product.changed");
    return this.get(userId, productId);
  }

  async deleteVariant(userId: string, productId: string, variantId: string) {
    await this.getOwned(userId, productId);
    await this.getVariant(productId, variantId);
    const count = await this.prisma.productVariant.count({ where: { productId } });
    if (count <= 1) {
      throw AppException.badRequest(
        ErrorCode.VARIANT_UNAVAILABLE,
        "A product must keep at least one variant",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.productVariant.delete({ where: { id: variantId } });
      await recomputeProductAggregates(tx, productId);
    });
    this.events.emit("product.changed");
  }

  async adjustStock(userId: string, variantId: string, dto: AdjustStockDto) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, product: { shop: { sellerProfile: { userId } } } },
      include: { product: { select: { id: true } } },
    });
    if (!variant) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Variant not found");
    }
    if (dto.delta === undefined && dto.set === undefined) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Provide either delta or set");
    }
    if (dto.delta !== undefined && dto.set !== undefined) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Provide only delta or set");
    }

    const productId = variant.product.id;
    const reason = dto.reason ?? "ADJUSTMENT";

    await this.prisma.$transaction(async (tx) => {
      const current = variant.stockQty;
      const next = dto.set !== undefined ? dto.set : current + (dto.delta ?? 0);
      if (next < 0) {
        throw AppException.unprocessable(
          ErrorCode.INSUFFICIENT_STOCK,
          "Stock cannot go below zero",
        );
      }
      const applied = next - current;

      const result = await tx.productVariant.updateMany({
        where: applied < 0 ? { id: variantId, stockQty: { gte: -applied } } : { id: variantId },
        data: { stockQty: { increment: applied } },
      });
      if (result.count === 0) {
        throw AppException.unprocessable(ErrorCode.INSUFFICIENT_STOCK, "Not enough stock");
      }

      await tx.inventoryLog.create({
        data: {
          variantId,
          delta: applied,
          stockAfter: next,
          reason,
          createdById: userId,
        },
      });
      await recomputeProductAggregates(tx, productId);
    });

    this.events.emit("product.changed");
    const updated = await this.prisma.productVariant.findUniqueOrThrow({
      where: { id: variantId },
      select: { id: true, stockQty: true, lowStockThreshold: true },
    });
    if (updated.stockQty <= updated.lowStockThreshold) {
      await this.notifyLowStock(userId, productId, updated.stockQty);
    }
    return updated;
  }

  private async notifyLowStock(
    sellerUserId: string,
    productId: string,
    stockQty: number,
  ): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { name: true },
    });
    await this.notifications.create({
      userId: sellerUserId,
      type: "LOW_STOCK",
      title: "Low stock",
      body: `"${product?.name ?? "A product"}" is running low (${stockQty} left).`,
      data: { productId },
    });
  }

  async addImage(
    userId: string,
    productId: string,
    dto: { url: string; altText?: string; sortOrder?: number; isPrimary?: boolean },
  ) {
    await this.getOwned(userId, productId);
    const count = await this.prisma.productImage.count({ where: { productId } });
    if (count >= MAX_IMAGES) {
      throw AppException.badRequest(ErrorCode.TOO_MANY_IMAGES, `Maximum ${MAX_IMAGES} images`);
    }
    const makePrimary = dto.isPrimary ?? count === 0;

    await this.prisma.$transaction(async (tx) => {
      if (makePrimary) {
        await tx.productImage.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      await tx.productImage.create({
        data: {
          productId,
          url: dto.url,
          altText: dto.altText ?? null,
          sortOrder: dto.sortOrder ?? count,
          isPrimary: makePrimary,
        },
      });
      await this.uploads.attachAssetsInTransaction(tx, [dto.url]);
    });
    return this.get(userId, productId);
  }

  async updateImage(
    userId: string,
    productId: string,
    imageId: string,
    dto: { altText?: string; sortOrder?: number; isPrimary?: boolean },
  ) {
    await this.getOwned(userId, productId);
    await this.getImage(productId, imageId);

    await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary === true) {
        await tx.productImage.updateMany({
          where: { productId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      await tx.productImage.update({
        where: { id: imageId },
        data: {
          ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
        },
      });
    });
    return this.get(userId, productId);
  }

  async deleteImage(userId: string, productId: string, imageId: string) {
    await this.getOwned(userId, productId);
    const image = await this.prisma.productImage.findFirstOrThrow({
      where: { id: imageId, productId },
      select: { url: true },
    });
    await this.prisma.productImage.delete({ where: { id: imageId } });

    // Order history keeps an image snapshot; never delete an asset that a
    // historical order or another product image still points at.
    const [orderRefs, imageRefs] = await Promise.all([
      this.prisma.orderItem.count({ where: { imageUrl: image.url } }),
      this.prisma.productImage.count({ where: { url: image.url } }),
    ]);
    if (orderRefs === 0 && imageRefs === 0) {
      await this.uploads.deleteByUrl(image.url);
    }
    return this.get(userId, productId);
  }

  private async getOwned(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, deletedAt: null, shop: { sellerProfile: { userId } } },
      include: PRODUCT_DETAIL_INCLUDE,
    });
    if (!product) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Product not found");
    }
    return product;
  }

  private async getVariant(productId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!variant) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Variant not found");
    }
    return variant;
  }

  private async getImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
      select: { id: true },
    });
    if (!image) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Image not found");
    }
    return image;
  }

  private async assertCategory(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Unknown category");
    }
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = toUniqueSlug(name);
      const existing = await this.prisma.product.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!existing) {
        return slug;
      }
    }
    throw AppException.internal("Could not generate a unique product slug");
  }

  private toView(product: {
    id: string;
    name: string;
    nameBn: string | null;
    scientificName: string | null;
    slug: string;
    description: string;
    careInstructions: string | null;
    lightRequirement: string | null;
    wateringFrequency: string | null;
    careDifficulty: string | null;
    isIndoor: boolean | null;
    isPetSafe: boolean | null;
    matureHeightCm: number | null;
    tags: string[];
    careDetails: unknown;
    weightKg: unknown;
    extraChargeAfterQty: number | null;
    extraChargePerUnit: unknown;
    status: string;
    rejectionReason: string | null;
    minPrice: unknown;
    maxPrice: unknown;
    inStock: boolean;
    ratingAvg: unknown;
    ratingCount: number;
    soldCount: number;
    viewCount: number;
    publishedAt: Date | null;
    createdAt: Date;
    category: unknown;
    variants: unknown;
    images: unknown;
  }) {
    return {
      id: product.id,
      name: product.name,
      nameBn: product.nameBn,
      scientificName: product.scientificName,
      slug: product.slug,
      description: product.description,
      careInstructions: product.careInstructions,
      lightRequirement: product.lightRequirement,
      wateringFrequency: product.wateringFrequency,
      careDifficulty: product.careDifficulty,
      isIndoor: product.isIndoor,
      isPetSafe: product.isPetSafe,
      matureHeightCm: product.matureHeightCm,
      tags: product.tags,
      careDetails: product.careDetails,
      weightKg: product.weightKg,
      extraChargeAfterQty: product.extraChargeAfterQty,
      extraChargePerUnit: product.extraChargePerUnit,
      status: product.status,
      rejectionReason: product.rejectionReason,
      minPrice: product.minPrice,
      maxPrice: product.maxPrice,
      inStock: product.inStock,
      ratingAvg: product.ratingAvg,
      ratingCount: product.ratingCount,
      soldCount: product.soldCount,
      viewCount: product.viewCount,
      publishedAt: product.publishedAt,
      createdAt: product.createdAt,
      category: product.category,
      variants: product.variants,
      images: product.images,
    };
  }
}


