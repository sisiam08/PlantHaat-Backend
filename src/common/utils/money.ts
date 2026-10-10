import { Prisma } from "../../generated/prisma/client";

export type MoneyInput = string | number | Prisma.Decimal;

export function toDecimal(value: MoneyInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function round2(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2);
}

export function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
}

export function formatBdt(value: Prisma.Decimal): string {
  return `BDT ${value.toFixed(2)}`;
}
