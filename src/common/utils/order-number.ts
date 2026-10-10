import { randomChars } from "./crypto";

const ORDER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function datePart(now: Date): string {
  const year = String(now.getUTCFullYear() % 100).padStart(2, "0");
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function generateOrderNumber(now: Date = new Date()): string {
  return `PH-${datePart(now)}-${randomChars(6, ORDER_ALPHABET)}`;
}

export function toShopOrderNumber(orderNumber: string, index: number): string {
  return `${orderNumber}-${index}`;
}

export function generateComplaintTicket(now: Date = new Date()): string {
  return `PC-${datePart(now)}-${randomChars(4, ORDER_ALPHABET)}`;
}

export function generatePayoutNumber(now: Date = new Date()): string {
  return `PY-${datePart(now)}-${randomChars(6, ORDER_ALPHABET)}`;
}
