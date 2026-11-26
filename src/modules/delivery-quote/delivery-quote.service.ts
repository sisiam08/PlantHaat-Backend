import { Injectable, Logger } from "@nestjs/common";

import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { resolveDeliveryCondition } from "../orders/delivery-condition.resolver";
import { SettingsService } from "../settings/settings.service";
import {
  SteadfastQuoteClient,
  type SteadfastHealth,
  type SteadfastQuote,
} from "./steadfast-quote.client";

export type DeliveryQuoteSource = "LIVE" | "CACHE" | "STALE" | "OVERRIDE" | "FALLBACK";
export type DeliveryQuoteReason =
  | "ADDRESS_THANA_REQUIRED"
  | "SHOP_PICKUP_INCOMPLETE"
  | "DISTRICT_UNMAPPED"
  | "NO_RATE"
  | "ROUTE_UNAVAILABLE";

export interface DeliveryQuoteLine {
  weightKg?: Prisma.Decimal | number | string | null;
  quantity: number;
  extraChargeAfterQty?: number | null;
  extraChargePerUnit?: Prisma.Decimal | number | string | null;
}

export interface ShopDeliveryQuote {
  available: boolean;
  courierCharge: Prisma.Decimal | null;
  extraCharge: Prisma.Decimal;
  total: Prisma.Decimal;
  weightKg: Prisma.Decimal;
  lane: string | null;
  source: DeliveryQuoteSource | null;
  estimated: boolean;
  reason?: DeliveryQuoteReason;
  freeDeliveryApplied: boolean;
  fetchedAt: Date | null;
  fromSteadfastId: number | null;
  toSteadfastId: number | null;
}

interface PickupLocation {
  steadfastId: number;
  districtName: string;
}

const DHAKA_DISTRICT = "Dhaka";
const DHAKA_CITY_ID = 1;
const DHAKA_SUBURBAN_ID = 18;
const MAX_WEIGHT_KG = 600;
const DEFAULT_WEIGHT_KG = 0.5;

function normalizedName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function roundWeightStep(totalKg: number): number {
  const capped = Math.min(Math.max(totalKg, DEFAULT_WEIGHT_KG), MAX_WEIGHT_KG);
  return Math.min(MAX_WEIGHT_KG, Math.max(0.5, Math.ceil(capped * 2) / 2));
}

export function parcelWeight(lines: DeliveryQuoteLine[]): number {
  let total = 0;
  let any = false;
  for (const line of lines) {
    if (line.weightKg === null || line.weightKg === undefined) continue;
    const weight = Number(line.weightKg.toString());
    if (!Number.isFinite(weight) || weight <= 0) continue;
    any = true;
    total += weight * Math.max(0, line.quantity);
  }
  return roundWeightStep(any ? total : DEFAULT_WEIGHT_KG);
}

export function sellerExtra(lines: DeliveryQuoteLine[]): Prisma.Decimal {
  let extra = new Prisma.Decimal(0);
  for (const line of lines) {
    if (
      line.extraChargeAfterQty === null ||
      line.extraChargeAfterQty === undefined ||
      line.extraChargePerUnit === null ||
      line.extraChargePerUnit === undefined
    ) {
      continue;
    }
    if (line.quantity <= line.extraChargeAfterQty) continue;
    const perUnit = new Prisma.Decimal(line.extraChargePerUnit.toString());
    extra = extra.plus(perUnit.mul(line.quantity - line.extraChargeAfterQty));
  }
  return extra.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

@Injectable()
export class DeliveryQuoteService {
  private readonly logger = new Logger(DeliveryQuoteService.name);
  private readonly inflight = new Map<string, Promise<SteadfastQuote>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly client: SteadfastQuoteClient,
  ) {}

  async quoteShop(params: {
    shopId: string;
    districtId: number;
    thanaId?: string | null;
    lines: DeliveryQuoteLine[];
    subtotal: Prisma.Decimal;
    freeDeliveryEnabled?: boolean;
    freeDeliveryAbove?: Prisma.Decimal | null;
  }): Promise<ShopDeliveryQuote> {
    const weightKg = new Prisma.Decimal(parcelWeight(params.lines));
    const extra = sellerExtra(params.lines);
    const freeDeliveryApplied = Boolean(
      params.freeDeliveryEnabled &&
        params.freeDeliveryAbove !== null &&
        params.freeDeliveryAbove !== undefined &&
        params.subtotal.gte(params.freeDeliveryAbove),
    );

    const destination = await this.resolveDestination(params.districtId, params.thanaId);
    if (typeof destination === "string") {
      return this.unavailable(weightKg, extra, destination);
    }
    const pickup = await this.resolvePickup(params.shopId);
    if (typeof pickup === "string") {
      return this.unavailable(weightKg, extra, pickup);
    }

    const rate = await this.resolveRate(pickup.steadfastId, destination.steadfastId, weightKg);
    if (!rate.available || rate.charge === null) {
      return {
        ...this.unavailable(weightKg, extra, rate.reason ?? "ROUTE_UNAVAILABLE"),
        source: rate.source,
        lane: rate.lane,
        fetchedAt: rate.fetchedAt,
        fromSteadfastId: pickup.steadfastId,
        toSteadfastId: destination.steadfastId,
      };
    }

    const total = freeDeliveryApplied
      ? new Prisma.Decimal(0)
      : rate.charge.plus(extra).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    return {
      available: true,
      courierCharge: rate.charge,
      extraCharge: extra,
      total,
      weightKg,
      lane: rate.lane,
      source: rate.source,
      estimated: rate.source === "STALE" || rate.source === "FALLBACK",
      freeDeliveryApplied,
      fetchedAt: rate.fetchedAt,
      fromSteadfastId: pickup.steadfastId,
      toSteadfastId: destination.steadfastId,
    };
  }

  async health(): Promise<SteadfastHealth> {
    const liveEnabled = await this.settings.getBoolean("delivery.quote.live.enabled");
    return this.client.health(liveEnabled);
  }

  async warmUpPickup(shopId: string): Promise<{ queued: number; liveEnabled: boolean }> {
    const liveEnabled = await this.settings.getBoolean("delivery.quote.live.enabled");
    if (!liveEnabled) {
      return { queued: 0, liveEnabled: false };
    }
    const pickup = await this.resolvePickup(shopId);
    if (typeof pickup === "string") {
      return { queued: 0, liveEnabled: true };
    }
    const destinations = await this.prisma.steadfastLocation.findMany({
      select: { id: true },
    });
    for (const destination of destinations) {
      void this.fetchAndCache(pickup.steadfastId, destination.id, new Prisma.Decimal(0.5)).catch(
        () => undefined,
      );
    }
    return { queued: destinations.length, liveEnabled: true };
  }

  private unavailable(
    weightKg: Prisma.Decimal,
    extra: Prisma.Decimal,
    reason: DeliveryQuoteReason,
  ): ShopDeliveryQuote {
    return {
      available: false,
      courierCharge: null,
      extraCharge: extra,
      total: new Prisma.Decimal(0),
      weightKg,
      lane: null,
      source: null,
      estimated: false,
      reason,
      freeDeliveryApplied: false,
      fetchedAt: null,
      fromSteadfastId: null,
      toSteadfastId: null,
    };
  }

  private async resolvePickup(shopId: string): Promise<PickupLocation | DeliveryQuoteReason> {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: {
        district: true,
        pickupDistrict: {
          select: { id: true, name: true, steadfastLocationId: true },
        },
        pickupThana: {
          select: {
            dhakaZone: true,
            district: { select: { name: true, steadfastLocationId: true } },
          },
        },
      },
    });
    if (!shop) {
      return "SHOP_PICKUP_INCOMPLETE";
    }

    if (shop.pickupThana?.dhakaZone) {
      return {
        steadfastId:
          shop.pickupThana.dhakaZone === "SUBURBAN" ? DHAKA_SUBURBAN_ID : DHAKA_CITY_ID,
        districtName: DHAKA_DISTRICT,
      };
    }
    if (shop.pickupDistrict) {
      return this.locationForDistrict(shop.pickupDistrict);
    }
    if (shop.pickupThana?.district) {
      return this.locationForDistrict(shop.pickupThana.district);
    }
    if (shop.district) {
      const district = await this.findDistrictByName(shop.district);
      if (district) {
        return this.locationForDistrict(district);
      }
    }
    return "SHOP_PICKUP_INCOMPLETE";
  }

  private async resolveDestination(
    districtId: number,
    thanaId?: string | null,
  ): Promise<{ steadfastId: number } | DeliveryQuoteReason> {
    const district = await this.prisma.district.findUnique({
      where: { id: districtId },
      select: { id: true, name: true, steadfastLocationId: true },
    });
    if (!district) {
      return "DISTRICT_UNMAPPED";
    }
    if (thanaId) {
      const thana = await this.prisma.thana.findFirst({
        where: { id: thanaId, districtId },
        select: { dhakaZone: true },
      });
      if (thana?.dhakaZone) {
        return {
          steadfastId: thana.dhakaZone === "SUBURBAN" ? DHAKA_SUBURBAN_ID : DHAKA_CITY_ID,
        };
      }
    }
    if (district.name === DHAKA_DISTRICT) {
      return "ADDRESS_THANA_REQUIRED";
    }
    if (district.steadfastLocationId === null) {
      return "DISTRICT_UNMAPPED";
    }
    return { steadfastId: district.steadfastLocationId };
  }

  private locationForDistrict(district: {
    name: string;
    steadfastLocationId: number | null;
  }): PickupLocation | DeliveryQuoteReason {
    if (district.name === DHAKA_DISTRICT) {
      return "SHOP_PICKUP_INCOMPLETE";
    }
    if (district.steadfastLocationId === null) {
      return "DISTRICT_UNMAPPED";
    }
    return {
      steadfastId: district.steadfastLocationId,
      districtName: district.name,
    };
  }

  private async findDistrictByName(name: string) {
    const districts = await this.prisma.district.findMany({
      select: { id: true, name: true, steadfastLocationId: true },
    });
    const wanted = normalizedName(name);
    return (
      districts.find((district) => normalizedName(district.name) === wanted) ??
      districts.find((district) => normalizedName(district.name).includes(wanted)) ??
      null
    );
  }

  private async resolveRate(
    from: number,
    to: number,
    weightKg: Prisma.Decimal,
  ): Promise<{
    available: boolean;
    charge: Prisma.Decimal | null;
    lane: string | null;
    source: DeliveryQuoteSource;
    fetchedAt: Date | null;
    reason?: DeliveryQuoteReason;
  }> {
    const weightStep = new Prisma.Decimal(roundWeightStep(weightKg.toNumber()));
    const cache = await this.prisma.courierQuoteCache.findUnique({
      where: {
        fromSteadfastId_toSteadfastId_weightStep: {
          fromSteadfastId: from,
          toSteadfastId: to,
          weightStep,
        },
      },
    });
    if (cache?.isOverride) {
      return this.fromCache(cache, "OVERRIDE");
    }

    const freshHours = await this.settings.getNumber("delivery.quote.cacheFreshHours");
    const staleDays = await this.settings.getNumber("delivery.quote.staleDays");
    const now = Date.now();
    const fresh = cache && cache.fetchedAt.getTime() >= now - freshHours * 3_600_000;
    if (cache && fresh) {
      return this.fromCache(cache, "CACHE");
    }

    const liveEnabled = await this.settings.getBoolean("delivery.quote.live.enabled");
    if (liveEnabled) {
      try {
        const quote = await this.fetchAndCache(from, to, weightStep);
        return {
          available: quote.available,
          charge: quote.charge,
          lane: quote.lane,
          source: "LIVE",
          fetchedAt: new Date(),
          reason: quote.available ? undefined : "ROUTE_UNAVAILABLE",
        };
      } catch (error) {
        this.logger.debug(
          `Live quote failed for ${from}->${to}: ${
            error instanceof Error ? error.message : "unknown"
          }`,
        );
      }
    }

    if (cache && cache.fetchedAt.getTime() >= now - staleDays * 86_400_000) {
      return this.fromCache(cache, "STALE");
    }

    return this.fallbackRate(from, to);
  }

  private fromCache(
    cache: {
      available: boolean;
      charge: Prisma.Decimal | null;
      lane: string | null;
      fetchedAt: Date;
    },
    source: DeliveryQuoteSource,
  ): {
    available: boolean;
    charge: Prisma.Decimal | null;
    lane: string | null;
    source: DeliveryQuoteSource;
    fetchedAt: Date;
    reason?: DeliveryQuoteReason;
  } {
    const available = cache.available && cache.charge !== null;
    return {
      available,
      charge: available ? cache.charge : null,
      lane: cache.lane,
      source,
      fetchedAt: cache.fetchedAt,
      reason: available ? undefined : "ROUTE_UNAVAILABLE",
    };
  }

  private async fallbackRate(
    from: number,
    to: number,
  ): Promise<{
    available: boolean;
    charge: Prisma.Decimal | null;
    lane: string | null;
    source: DeliveryQuoteSource;
    fetchedAt: Date | null;
    reason?: DeliveryQuoteReason;
  }> {
    const inside = from === DHAKA_CITY_ID && to === DHAKA_CITY_ID;
    const value = await this.settings.getNumber(
      inside ? "delivery.fallback.insideDhaka" : "delivery.fallback.outsideDhaka",
    );
    if (!Number.isFinite(value) || value <= 0) {
      return {
        available: false,
        charge: null,
        lane: inside ? "inside_dhaka" : "outside_dhaka",
        source: "FALLBACK",
        fetchedAt: null,
        reason: "NO_RATE",
      };
    }
    return {
      available: true,
      charge: new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      lane: inside ? "inside_dhaka" : "outside_dhaka",
      source: "FALLBACK",
      fetchedAt: null,
    };
  }

  private async fetchAndCache(
    from: number,
    to: number,
    weightStep: Prisma.Decimal,
  ): Promise<SteadfastQuote> {
    const key = `${from}:${to}:${weightStep.toString()}`;
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }
    const pending = this.client
      .fetch(from, to, weightStep)
      .then(async (quote) => {
        const fetchedAt = new Date();
        await this.prisma.courierQuoteCache.upsert({
          where: {
            fromSteadfastId_toSteadfastId_weightStep: {
              fromSteadfastId: from,
              toSteadfastId: to,
              weightStep,
            },
          },
          update: {
            charge: quote.charge,
            available: quote.available,
            lane: quote.lane,
            base: quote.base,
            weightExtra: quote.weightExtra,
            fetchedAt,
            source: "LIVE",
          },
          create: {
            fromSteadfastId: from,
            toSteadfastId: to,
            weightStep,
            charge: quote.charge,
            available: quote.available,
            lane: quote.lane,
            base: quote.base,
            weightExtra: quote.weightExtra,
            fetchedAt,
            source: "LIVE",
          },
        });
        return quote;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, pending);
    return pending;
  }

  async previewGuest(input: {
    districtId: number;
    thanaId?: string;
    shops: { shopId: string; items: { variantId: string; quantity: number }[] }[];
  }) {
    const district = await this.prisma.district.findUnique({
      where: { id: input.districtId },
      select: { name: true, insideDhaka: true },
    });
    const results = [];
    for (const shop of input.shops) {
      const variants = await this.prisma.productVariant.findMany({
        where: {
          id: { in: shop.items.map((item) => item.variantId) },
          product: { shopId: shop.shopId },
        },
        select: {
          id: true,
          price: true,
          product: {
            select: {
              weightKg: true,
              extraChargeAfterQty: true,
              extraChargePerUnit: true,
            },
          },
        },
      });
      const byId = new Map(variants.map((variant) => [variant.id, variant]));
      const lines: DeliveryQuoteLine[] = [];
      let subtotal = new Prisma.Decimal(0);
      let valid = true;
      for (const item of shop.items) {
        const variant = byId.get(item.variantId);
        if (!variant) {
          valid = false;
          continue;
        }
        subtotal = subtotal.plus(variant.price.mul(item.quantity));
        lines.push({
          weightKg: variant.product.weightKg,
          quantity: item.quantity,
          extraChargeAfterQty: variant.product.extraChargeAfterQty,
          extraChargePerUnit: variant.product.extraChargePerUnit,
        });
      }
      if (!district || !valid || lines.length === 0) {
        results.push({
          shopId: shop.shopId,
          available: false,
          deliveryCharge: null,
          courierCharge: null,
          sellerExtraCharge: "0",
          parcelWeightKg: null,
          lane: null,
          source: null,
          estimated: false,
          reason: district ? "ROUTE_UNAVAILABLE" : "DISTRICT_UNMAPPED",
          freeDeliveryApplied: false,
          paymentMode: null,
          estimatedDaysMin: null,
          estimatedDaysMax: null,
        });
        continue;
      }
      const delivery = await resolveDeliveryCondition(
        this.prisma,
        shop.shopId,
        input.districtId,
        district.insideDhaka,
      );
      if (!delivery) {
        results.push({
          shopId: shop.shopId,
          available: false,
          deliveryCharge: null,
          courierCharge: null,
          sellerExtraCharge: "0",
          parcelWeightKg: null,
          lane: null,
          source: null,
          estimated: false,
          reason: "DISTRICT_UNMAPPED",
          freeDeliveryApplied: false,
          paymentMode: null,
          estimatedDaysMin: null,
          estimatedDaysMax: null,
        });
        continue;
      }
      const quote = await this.quoteShop({
        shopId: shop.shopId,
        districtId: input.districtId,
        thanaId: input.thanaId,
        lines,
        subtotal,
        freeDeliveryEnabled: delivery.freeDeliveryEnabled,
        freeDeliveryAbove: delivery.freeDeliveryAbove,
      });
      results.push({
        shopId: shop.shopId,
        available: quote.available,
        deliveryCharge: quote.available ? quote.total.toString() : null,
        courierCharge: quote.courierCharge?.toString() ?? null,
        sellerExtraCharge: quote.extraCharge.toString(),
        parcelWeightKg: quote.weightKg.toString(),
        lane: quote.lane,
        source: quote.source,
        estimated: quote.estimated,
        reason: quote.reason ?? null,
        freeDeliveryApplied: quote.freeDeliveryApplied,
        paymentMode: delivery.paymentMode,
        estimatedDaysMin: delivery.estimatedDaysMin,
        estimatedDaysMax: delivery.estimatedDaysMax,
      });
    }
    return { shops: results };
  }
  async listOverrides() {
    return this.prisma.courierQuoteCache.findMany({
      where: { isOverride: true },
      orderBy: [{ fromSteadfastId: "asc" }, { toSteadfastId: "asc" }, { weightStep: "asc" }],
    });
  }

  async upsertOverride(input: {
    fromSteadfastId: number;
    toSteadfastId: number;
    weightStep: number;
    charge: number;
    available?: boolean;
    lane?: string | null;
  }) {
    const weightStep = new Prisma.Decimal(roundWeightStep(input.weightStep));
    return this.prisma.courierQuoteCache.upsert({
      where: {
        fromSteadfastId_toSteadfastId_weightStep: {
          fromSteadfastId: input.fromSteadfastId,
          toSteadfastId: input.toSteadfastId,
          weightStep,
        },
      },
      update: {
        charge: new Prisma.Decimal(input.charge),
        available: input.available ?? true,
        lane: input.lane ?? null,
        source: "ADMIN",
        isOverride: true,
        fetchedAt: new Date(),
      },
      create: {
        fromSteadfastId: input.fromSteadfastId,
        toSteadfastId: input.toSteadfastId,
        weightStep,
        charge: new Prisma.Decimal(input.charge),
        available: input.available ?? true,
        lane: input.lane ?? null,
        source: "ADMIN",
        isOverride: true,
      },
    });
  }

  async removeOverride(id: string): Promise<void> {
    await this.prisma.courierQuoteCache.deleteMany({ where: { id, isOverride: true } });
  }
}




