import type { Prisma } from "../../generated/prisma/client";
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
 * A district-specific active zone wins over a nationwide active zone.
 * Returns null when the shop does not deliver to the district.
 */
export async function resolveDeliveryZone(
  prisma: PrismaService,
  shopId: string,
  districtId: number,
): Promise<ResolvedDelivery | null> {
  const specific = await prisma.shopDeliveryZone.findFirst({
    where: { shopId, isActive: true, districts: { some: { districtId } } },
    orderBy: { charge: "asc" },
  });
  if (specific) {
    return toResolved(specific);
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
