import type { INestApplication } from "@nestjs/common";

import type { PrismaService } from "../src/prisma/prisma.service";
import { setSettings } from "./settings-test-helper";

/**
 * The delivery-quote engine never invents a price. Isolated e2e fixtures must
 * therefore provide a deterministic admin fallback and an explicit district
 * mapping instead of relying on the seller's legacy charge (or the live API).
 */
export async function useTestDeliveryRates(
  app: INestApplication,
  prisma: PrismaService,
  amounts: { insideDhaka?: number; outsideDhaka?: number } = {},
): Promise<void> {
  await setSettings(app, prisma, {
    "delivery.quote.live.enabled": false,
    "delivery.fallback.insideDhaka": amounts.insideDhaka ?? 60,
    "delivery.fallback.outsideDhaka": amounts.outsideDhaka ?? 60,
  });
}

export async function mapDistrictToSteadfast(
  prisma: PrismaService,
  districtId: number,
  steadfastLocationId = 1,
): Promise<void> {
  await prisma.steadfastLocation.upsert({
    where: { id: steadfastLocationId },
    update: {},
    create: {
      id: steadfastLocationId,
      name: steadfastLocationId === 1 ? "Dhaka City" : `Test location ${steadfastLocationId}`,
      kind: steadfastLocationId === 1 ? "DHAKA_CITY" : "DISTRICT",
    },
  });
  await prisma.district.update({
    where: { id: districtId },
    data: { steadfastLocationId },
  });
}

export function pickupForDistrict(districtId: number) {
  return {
    pickupDistrictId: districtId,
    pickupThanaId: null,
  };
}
