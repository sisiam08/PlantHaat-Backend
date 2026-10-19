import { jest } from "@jest/globals";

import { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import type { SettingsService } from "../settings/settings.service";
import { CartService } from "./cart.service";

type MockFn = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
const mockFn = (): MockFn => jest.fn<(...args: unknown[]) => Promise<unknown>>();
const dec = (value: number) => new Prisma.Decimal(value);

function createService(item: Record<string, unknown>) {
  const prisma = {
    cart: { upsert: mockFn().mockResolvedValue({ id: "cart-1" }) },
    cartItem: { findMany: mockFn().mockResolvedValue([item]) },
  };
  const settings = { getNumber: mockFn().mockResolvedValue(20) } as unknown as SettingsService;
  return {
    service: new CartService(prisma as unknown as PrismaService, settings),
    prisma,
  };
}

function cartItem(priceSnapshot: Prisma.Decimal | null) {
  return {
    variantId: "variant-1",
    quantity: 2,
    priceSnapshot,
    variant: {
      id: "variant-1",
      name: "Standard",
      price: dec(120),
      stockQty: 5,
      isActive: true,
      product: {
        id: "product-1",
        name: "Monstera",
        slug: "monstera",
        status: "ACTIVE",
        deletedAt: null,
        images: [{ url: "https://example.test/plant.webp", isPrimary: true }],
        shop: {
          id: "shop-1",
          name: "Green Shop",
          slug: "green-shop",
          logoUrl: null,
          district: "Dhaka",
          status: "ACTIVE",
          sellerProfile: { status: "APPROVED" },
        },
      },
    },
  };
}

describe("CartService price snapshots", () => {
  it("flags a line whose price changed and exposes from/to", async () => {
    const { service } = createService(cartItem(dec(100)));

    const cart = (await service.getCart("u-1")) as unknown as {
      priceChanged: boolean;
      changedLineCount: number;
      shops: { priceChanged: boolean; items: Record<string, unknown>[] }[];
    };

    expect(cart.priceChanged).toBe(true);
    expect(cart.changedLineCount).toBe(1);
    expect(cart.shops[0].priceChanged).toBe(true);
    expect(cart.shops[0].items[0]).toMatchObject({
      priceChanged: true,
      priceChangedFrom: "100",
      priceChangedTo: "120",
      lineTotal: dec(240),
    });
  });

  it("does not flag an unchanged or unknown snapshot", async () => {
    const unchanged = createService(cartItem(dec(120)));
    const unknown = createService(cartItem(null));

    const first = (await unchanged.service.getCart("u-1")) as { changedLineCount: number };
    const second = (await unknown.service.getCart("u-1")) as { changedLineCount: number };

    expect(first.changedLineCount).toBe(0);
    expect(second.changedLineCount).toBe(0);
  });
});
