import type { Prisma } from "../../generated/prisma/client";
import type { CityScope } from "../../generated/prisma/enums";
import type { PrismaService } from "../../prisma/prisma.service";

export interface ResolvedDelivery {
  zoneId: string;
  name: string;
  charge: Prisma.Decimal;
  freeDeliveryAbove: Prisma.Decimal | null;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}

/**
 * Shared precedence for cart, checkout and delivery quotes:
 *   (district + exact CITY/OUTSIDE scope) > (district + ALL) > nationwide.
 * `NA` (non-metro/unknown) skips the exact-scope tier.
 * Returns null when the shop does not deliver to the district.
 */
export async function resolveDeliveryZone(
  prisma: PrismaService,
  shopId: string,
  districtId: number,
  cityScope: CityScope = "NA",
): Promise<ResolvedDelivery | null> {
  if (cityScope === "CITY" || cityScope === "OUTSIDE") {
    const exact = await prisma.shopDeliveryZone.findFirst({
      where: {
        shopId,
        isActive: true,
        districts: { some: { districtId, areaScope: cityScope } },
      },
      orderBy: { charge: "asc" },
    });
    if (exact) {
      return toResolved(exact);
    }
  }

  const districtAll = await prisma.shopDeliveryZone.findFirst({
    where: {
      shopId,
      isActive: true,
      districts: { some: { districtId, areaScope: "ALL" } },
    },
    orderBy: { charge: "asc" },
  });
  if (districtAll) {
    return toResolved(districtAll);
  }

  const nationwide = await prisma.shopDeliveryZone.findFirst({
    where: { shopId, isActive: true, isNationwide: true },
    orderBy: { charge: "asc" },
  });
  return nationwide ? toResolved(nationwide) : null;
}

function toResolved(zone: {
  id: string;
  name: string;
  charge: Prisma.Decimal;
  freeDeliveryAbove: Prisma.Decimal | null;
  estimatedDaysMin: number;
  estimatedDaysMax: number;
}): ResolvedDelivery {
  return {
    zoneId: zone.id,
    name: zone.name,
    charge: zone.charge,
    freeDeliveryAbove: zone.freeDeliveryAbove,
    estimatedDaysMin: zone.estimatedDaysMin,
    estimatedDaysMax: zone.estimatedDaysMax,
  };
}
