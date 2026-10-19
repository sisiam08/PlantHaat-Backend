import { jest } from "@jest/globals";

import { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";
import { resolveDeliveryZone } from "./delivery-zone.resolver";

const zone = (id: string, charge: number) => ({
  id,
  name: id,
  charge: new Prisma.Decimal(charge),
  freeDeliveryAbove: null,
  estimatedDaysMin: 1,
  estimatedDaysMax: 3,
});

function prismaWith(...results: (ReturnType<typeof zone> | null)[]) {
  const findFirst = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  for (const result of results) {
    findFirst.mockResolvedValueOnce(result);
  }
  return { shopDeliveryZone: { findFirst } } as unknown as PrismaService;
}

describe("resolveDeliveryZone precedence", () => {
  it("prefers district + exact city scope", async () => {
    const prisma = prismaWith(zone("exact", 50), zone("all", 70), zone("nationwide", 90));

    const result = await resolveDeliveryZone(prisma, "shop-1", 18, "CITY");

    expect(result?.zoneId).toBe("exact");
    expect((prisma as unknown as { shopDeliveryZone: { findFirst: jest.Mock } }).shopDeliveryZone.findFirst).toHaveBeenCalledTimes(1);
  });

  it("falls back to district + ALL", async () => {
    const prisma = prismaWith(null, zone("all", 70), zone("nationwide", 90));

    const result = await resolveDeliveryZone(prisma, "shop-1", 18, "OUTSIDE");

    expect(result?.zoneId).toBe("all");
  });

  it("skips the exact scope for NA and uses ALL then nationwide", async () => {
    const prisma = prismaWith(null, zone("nationwide", 90));

    const result = await resolveDeliveryZone(prisma, "shop-1", 18, "NA");

    expect(result?.zoneId).toBe("nationwide");
    expect((prisma as unknown as { shopDeliveryZone: { findFirst: jest.Mock } }).shopDeliveryZone.findFirst).toHaveBeenCalledTimes(2);
  });

  it("returns null when nothing covers the district", async () => {
    const prisma = prismaWith(null, null);
    await expect(resolveDeliveryZone(prisma, "shop-1", 18, "NA")).resolves.toBeNull();
  });
});
