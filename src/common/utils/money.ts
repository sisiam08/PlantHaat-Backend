import { Prisma } from "../../generated/prisma/client";

export type MoneyInput = string | number | Prisma.Decimal;

/**
 * ONE rounding rule for the whole backend: Decimal, ROUND_HALF_UP, 2 dp.
 * Commission is computed per line and then summed; totals are the sum of the
 * already-rounded components, so `commission + sellerNet = shopTotal`.
 */
export const MONEY_ROUNDING = Prisma.Decimal.ROUND_HALF_UP;

export function toDecimal(value: MoneyInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function money(value: MoneyInput): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, MONEY_ROUNDING);
}

/** Rounds to 2 dp with the shared rule. */
export function round2(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, MONEY_ROUNDING);
}

export function lineTotal(unitPrice: MoneyInput, quantity: number): Prisma.Decimal {
  return money(toDecimal(unitPrice).mul(quantity));
}

export function lineCommission(amount: MoneyInput, ratePercent: MoneyInput): Prisma.Decimal {
  return money(toDecimal(amount).mul(toDecimal(ratePercent)).div(100));
}

export function sumMoney(values: MoneyInput[]): Prisma.Decimal {
  return money(values.reduce<Prisma.Decimal>((total, value) => total.plus(toDecimal(value)), new Prisma.Decimal(0)));
}

export function negateMoney(value: MoneyInput): Prisma.Decimal {
  return money(toDecimal(value).negated());
}

export function formatBdt(value: Prisma.Decimal): string {
  return `BDT ${value.toFixed(2)}`;
}
