import { jest } from "@jest/globals";

import { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import type { SettingsService } from "../settings/settings.service";
import {
  DeliveryQuoteService,
  parcelWeight,
  roundWeightStep,
  sellerExtra,
} from "./delivery-quote.service";
import type { SteadfastQuoteClient } from "./steadfast-quote.client";

const dec = (value: number) => new Prisma.Decimal(value);

function settings(values: Record<string, unknown> = {}): SettingsService {
  const defaults: Record<string, unknown> = {
    "delivery.quote.live.enabled": false,
    "delivery.quote.cacheFreshHours": 24,
    "delivery.quote.staleDays": 30,
    "delivery.fallback.insideDhaka": 0,
    "delivery.fallback.outsideDhaka": 0,
    ...values,
  };
  return {
    getBoolean: jest.fn(async (key: string) => Boolean(defaults[key])),
    getNumber: jest.fn(async (key: string) => Number(defaults[key])),
  } as unknown as SettingsService;
}

function prismaMock(options: {
  district?: Record<string, unknown> | null;
  thana?: Record<string, unknown> | null;
  shop?: Record<string, unknown> | null;
  cache?: Record<string, unknown> | null;
  districts?: Record<string, unknown>[];
}) {
  return {
    district: {
      findUnique: jest.fn(async () => options.district ?? null),
      findMany: jest.fn(async () => options.districts ?? []),
    },
    thana: { findFirst: jest.fn(async () => options.thana ?? null) },
    shop: { findUnique: jest.fn(async () => options.shop ?? null) },
    steadfastLocation: {
      findMany: jest.fn(async () => [{ id: 1 }, { id: 2 }]),
    },
    courierQuoteCache: {
      findUnique: jest.fn(async () => options.cache ?? null),
      upsert: jest.fn(async (args: { create: Record<string, unknown> }) => args.create),
    },
  };
}

function clientMock(
  result: {
    charge?: Prisma.Decimal | null;
    available?: boolean;
    lane?: string | null;
    base?: Prisma.Decimal | null;
    weightExtra?: Prisma.Decimal;
  } = {},
): SteadfastQuoteClient & { fetch: jest.Mock } {
  return {
    fetch: jest.fn(async () => ({
      charge: result.charge ?? dec(65),
      available: result.available ?? true,
      lane: result.lane ?? "inside_dhaka",
      base: result.base ?? null,
      weightExtra: result.weightExtra ?? dec(0),
    })),
    health: jest.fn(),
  } as unknown as SteadfastQuoteClient & { fetch: jest.Mock };
}

const baseShop = {
  district: "Dhaka",
  pickupDistrict: { id: 1, name: "Dhaka", steadfastLocationId: null },
  pickupThana: {
    dhakaZone: "CITY",
    district: { name: "Dhaka", steadfastLocationId: null },
  },
};

function build(
  options: Parameters<typeof prismaMock>[0],
  settingsValues: Record<string, unknown> = {},
  client = clientMock(),
) {
  const prisma = prismaMock(options);
  const service = new DeliveryQuoteService(
    prisma as unknown as PrismaService,
    settings(settingsValues),
    client,
  );
  return { service, prisma, client };
}

describe("delivery quote helpers", () => {
  it("rounds weight up to the next 0.5 kg step and caps at 600", () => {
    expect(roundWeightStep(0.5)).toBe(0.5);
    expect(roundWeightStep(0.51)).toBe(1);
    expect(roundWeightStep(1)).toBe(1);
    expect(roundWeightStep(600)).toBe(600);
    expect(roundWeightStep(601)).toBe(600);
  });

  it("defaults to 0.5 kg when no line has a weight", () => {
    expect(parcelWeight([{ quantity: 3 }])).toBe(0.5);
    expect(
      parcelWeight([
        { weightKg: "0.4", quantity: 2 },
        { weightKg: "0.3", quantity: 1 },
      ]),
    ).toBe(1.5);
  });

  it("applies the extra only above the threshold, per line", () => {
    expect(
      sellerExtra([
        { quantity: 10, extraChargeAfterQty: 10, extraChargePerUnit: 10 },
      ]).toString(),
    ).toBe("0");
    expect(
      sellerExtra([
        { quantity: 13, extraChargeAfterQty: 10, extraChargePerUnit: 10 },
      ]).toString(),
    ).toBe("30");
    expect(
      sellerExtra([
        { quantity: 3, extraChargeAfterQty: 1, extraChargePerUnit: 5 },
        { quantity: 5, extraChargeAfterQty: 4, extraChargePerUnit: 2 },
      ]).toString(),
    ).toBe("12");
  });
});

describe("DeliveryQuoteService.quoteShop", () => {
  const lines = [{ weightKg: 0.5, quantity: 2 }];
  const subtotal = dec(500);

  it("requires a thana for a Dhaka address", async () => {
    const { service } = build({
      district: { id: 1, name: "Dhaka", steadfastLocationId: null },
    });
    const quote = await service.quoteShop({
      shopId: "shop-1",
      districtId: 1,
      lines,
      subtotal,
    });
    expect(quote.available).toBe(false);
    expect(quote.reason).toBe("ADDRESS_THANA_REQUIRED");
  });

  it("requires a pickup thana for a Dhaka shop", async () => {
    const { service } = build({
      district: { id: 1, name: "Dhaka", steadfastLocationId: null },
      thana: { dhakaZone: "CITY" },
      shop: { ...baseShop, pickupThana: null },
    });
    const quote = await service.quoteShop({
      shopId: "shop-1",
      districtId: 1,
      thanaId: "thana-1",
      lines,
      subtotal,
    });
    expect(quote.available).toBe(false);
    expect(quote.reason).toBe("SHOP_PICKUP_INCOMPLETE");
  });

  it("reports an unmapped district", async () => {
    const { service } = build({
      district: { id: 9, name: "Atlantis", steadfastLocationId: null },
      shop: baseShop,
    });
    const quote = await service.quoteShop({
      shopId: "shop-1",
      districtId: 9,
      lines,
      subtotal,
    });
    expect(quote.available).toBe(false);
    expect(quote.reason).toBe("DISTRICT_UNMAPPED");
  });

  it("prefers an admin override over everything", async () => {
    const { service, client } = build(
      {
        district: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
        shop: {
          ...baseShop,
          pickupDistrict: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
          district: "Chattogram",
        },
        cache: {
          available: true,
          charge: dec(55),
          lane: "outside_dhaka",
          fetchedAt: new Date(0),
          isOverride: true,
        },
      },
      { "delivery.quote.live.enabled": true },
    );
    const quote = await service.quoteShop({
      shopId: "shop-1",
      districtId: 2,
      lines,
      subtotal,
    });
    expect(quote.source).toBe("OVERRIDE");
    expect(quote.courierCharge?.toString()).toBe("55");
    expect(client.fetch).not.toHaveBeenCalled();
  });

  it("uses a fresh cache without a network call", async () => {
    const { service, client } = build({
      district: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
      shop: { ...baseShop, pickupDistrict: null, district: "Chattogram" },
      cache: {
        available: true,
        charge: dec(70),
        lane: "outside_dhaka",
        fetchedAt: new Date(),
        isOverride: false,
      },
    });
    const quote = await service.quoteShop({
      shopId: "shop-1",
      districtId: 2,
      lines,
      subtotal,
    });
    expect(quote.source).toBe("CACHE");
    expect(quote.courierCharge?.toString()).toBe("70");
    expect(client.fetch).not.toHaveBeenCalled();
  });

  it("uses a stale cache when the live switch is off", async () => {
    const { service } = build(
      {
        district: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
        shop: {
          ...baseShop,
          pickupDistrict: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
          district: "Chattogram",
        },
        cache: {
          available: true,
          charge: dec(80),
          lane: "outside_dhaka",
          fetchedAt: new Date(Date.now() - 5 * 86_400_000),
          isOverride: false,
        },
      },
      { "delivery.quote.live.enabled": false },
    );
    const quote = await service.quoteShop({
      shopId: "shop-1",
      districtId: 2,
      lines,
      subtotal,
    });
    expect(quote.source).toBe("STALE");
    expect(quote.estimated).toBe(true);
    expect(quote.courierCharge?.toString()).toBe("80");
  });

  it("uses the configured fallback when nothing is cached", async () => {
    const { service } = build(
      {
        district: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
        shop: {
          ...baseShop,
          pickupDistrict: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
          district: "Chattogram",
        },
      },
      { "delivery.fallback.outsideDhaka": 120 },
    );
    const quote = await service.quoteShop({
      shopId: "shop-1",
      districtId: 2,
      lines,
      subtotal,
    });
    expect(quote.source).toBe("FALLBACK");
    expect(quote.courierCharge?.toString()).toBe("120");
  });

  it("is unavailable when the fallback is unset", async () => {
    const { service } = build({
      district: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
      shop: { ...baseShop, pickupDistrict: null, district: "Chattogram" },
    });
    const quote = await service.quoteShop({
      shopId: "shop-1",
      districtId: 2,
      lines,
      subtotal,
    });
    expect(quote.available).toBe(false);
    expect(quote.reason).toBe("NO_RATE");
  });

  it("fetches live and caches when the switch is on", async () => {
    const { service, prisma, client } = build(
      {
        district: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
        shop: {
          ...baseShop,
          pickupDistrict: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
          district: "Chattogram",
        },
      },
      { "delivery.quote.live.enabled": true },
    );
    const quote = await service.quoteShop({
      shopId: "shop-1",
      districtId: 2,
      lines,
      subtotal,
    });
    expect(quote.source).toBe("LIVE");
    expect(client.fetch).toHaveBeenCalledTimes(1);
    expect(prisma.courierQuoteCache.upsert).toHaveBeenCalled();
  });

  it("falls back to a stale cache when the live request fails", async () => {
    const client = clientMock();
    (client.fetch as jest.Mock).mockImplementation(async () => {
      throw new Error("timeout");
    });
    const { service } = build(
      {
        district: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
        shop: {
          ...baseShop,
          pickupDistrict: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
          district: "Chattogram",
        },
        cache: {
          available: true,
          charge: dec(75),
          lane: "outside_dhaka",
          fetchedAt: new Date(Date.now() - 86_400_000),
          isOverride: false,
        },
      },
      { "delivery.quote.live.enabled": true },
      client,
    );
    const quote = await service.quoteShop({
      shopId: "shop-1",
      districtId: 2,
      lines,
      subtotal,
    });
    expect(quote.source).toBe("STALE");
  });

  it("de-duplicates concurrent identical live fetches", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const client = clientMock();
    (client.fetch as jest.Mock).mockImplementation(async () => {
      await gate;
      return {
        charge: dec(65),
        available: true,
        lane: "inside_dhaka",
        base: null,
        weightExtra: dec(0),
      };
    });
    const { service } = build(
      {
        district: { id: 1, name: "Dhaka", steadfastLocationId: null },
        thana: { dhakaZone: "CITY" },
        shop: baseShop,
      },
      { "delivery.quote.live.enabled": true },
      client,
    );
    const params = {
      shopId: "shop-1",
      districtId: 1,
      thanaId: "thana-1",
      lines,
      subtotal,
    };
    const first = service.quoteShop(params);
    const second = service.quoteShop(params);
    release?.();
    const [a, b] = await Promise.all([first, second]);
    expect(a.source).toBe("LIVE");
    expect(b.source).toBe("LIVE");
    expect(client.fetch).toHaveBeenCalledTimes(1);
  });

  it("applies seller-funded free delivery at the exact threshold", async () => {
    const { service } = build(
      {
        district: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
        shop: {
          ...baseShop,
          pickupDistrict: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
          district: "Chattogram",
        },
      },
      { "delivery.fallback.outsideDhaka": 120 },
    );
    const quote = await service.quoteShop({
      shopId: "shop-1",
      districtId: 2,
      lines,
      subtotal: dec(1000),
      freeDeliveryEnabled: true,
      freeDeliveryAbove: dec(1000),
    });
    expect(quote.freeDeliveryApplied).toBe(true);
    expect(quote.total.toString()).toBe("0");
    expect(quote.courierCharge?.toString()).toBe("120");
  });

  it("adds the seller extra to the courier charge", async () => {
    const { service } = build(
      {
        district: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
        shop: {
          ...baseShop,
          pickupDistrict: { id: 2, name: "Chattogram", steadfastLocationId: 2 },
          district: "Chattogram",
        },
      },
      { "delivery.fallback.outsideDhaka": 120 },
    );
    const quote = await service.quoteShop({
      shopId: "shop-1",
      districtId: 2,
      lines: [{ weightKg: 0.5, quantity: 13, extraChargeAfterQty: 10, extraChargePerUnit: 10 }],
      subtotal,
    });
    expect(quote.extraCharge.toString()).toBe("30");
    expect(quote.total.toString()).toBe("150");
  });
});
