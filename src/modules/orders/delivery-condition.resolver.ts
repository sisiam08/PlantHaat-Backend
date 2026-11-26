import { Prisma } from "../../generated/prisma/client";
import type { DeliveryCondition, DeliveryPaymentMode } from "../../generated/prisma/enums";
import type { PrismaService } from "../../prisma/prisma.service";
import { resolveDeliveryZone, type ResolvedDelivery } from "./delivery-zone.resolver";

export interface ResolvedDeliveryCondition extends ResolvedDelivery {
  condition: DeliveryCondition;
  freeDeliveryEnabled: boolean;
  paymentMode: DeliveryPaymentMode;
}

/**
 * Nationwide delivery has exactly two seller-visible conditions. A shop without
 * an explicit condition row keeps its legacy zones (old fee/coverage) and both
 * payment methods; if it has no legacy zone at all it still delivers
 * nationwide with no fee, matching the "both methods everywhere" default.
 */
export async function resolveDeliveryCondition(
  prisma: PrismaService,
  shopId: string,
  districtId: number,
  knownInsideDhaka?: boolean,
): Promise<ResolvedDeliveryCondition | null> {
  const insideDhaka =
    knownInsideDhaka ??
    (
      await prisma.district.findUnique({
        where: { id: districtId },
        select: { insideDhaka: true },
      })
    )?.insideDhaka;
  if (insideDhaka === undefined) {
    return null;
  }
  const condition: DeliveryCondition = insideDhaka ? "INSIDE_DHAKA" : "OUTSIDE_DHAKA";

  const configured = await prisma.shopDeliveryZone.findFirst({
    where: { shopId, condition, isActive: true },
  });
  if (configured) {
    return {
      zoneId: configured.id,
      name: condition,
      charge: configured.charge,
      freeDeliveryAbove: configured.freeDeliveryAbove,
      estimatedDaysMin: configured.estimatedDaysMin,
      estimatedDaysMax: configured.estimatedDaysMax,
      freeDeliveryEnabled: configured.freeDeliveryEnabled,
      condition,
      paymentMode: configured.paymentMode,
    };
  }

  // Transitional: old shops have district/nationwide zones but no condition row.
  // Preserve their legacy fee where it covers the destination, otherwise use the
  // cheapest active legacy zone so the new nationwide promise still holds.
  const legacyZone = await resolveDeliveryZone(prisma, shopId, districtId);
  if (legacyZone) {
    return { ...legacyZone, condition, paymentMode: "COD_AND_ADVANCE" };
  }
  const legacyRow = await prisma.shopDeliveryZone.findFirst({
    where: { shopId, isActive: true },
    orderBy: { charge: "asc" },
  });
  if (legacyRow) {
    return {
      zoneId: legacyRow.id,
      name: legacyRow.name,
      charge: legacyRow.charge,
      freeDeliveryAbove: legacyRow.freeDeliveryAbove,
      estimatedDaysMin: legacyRow.estimatedDaysMin,
      estimatedDaysMax: legacyRow.estimatedDaysMax,
      freeDeliveryEnabled: legacyRow.freeDeliveryEnabled,
      condition,
      paymentMode: "COD_AND_ADVANCE",
    };
  }

  return {
    zoneId: "",
    name: condition,
    charge: new Prisma.Decimal(0),
    freeDeliveryAbove: null,
    estimatedDaysMin: 1,
    estimatedDaysMax: 3,
    freeDeliveryEnabled: false,
    condition,
    paymentMode: "COD_AND_ADVANCE",
  };
}




