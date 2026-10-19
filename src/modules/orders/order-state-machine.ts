import type { OrderStatus } from "../../generated/prisma/enums";

export type OrderActor = "CUSTOMER" | "SELLER" | "ADMIN" | "SYSTEM";

const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, OrderActor[]>>> = {
  PENDING: {
    CONFIRMED: ["SELLER"],
    CANCELLED: ["CUSTOMER", "SELLER", "ADMIN", "SYSTEM"],
  },
  CONFIRMED: {
    PACKED: ["SELLER"],
    CANCELLED: ["SELLER", "ADMIN"],
  },
  PACKED: {
    SHIPPED: ["SELLER"],
    CANCELLED: ["SELLER", "ADMIN"],
  },
  SHIPPED: {
    DELIVERED: ["SELLER", "ADMIN"],
    FAILED_DELIVERY: ["SELLER", "ADMIN"],
    // Admin bulk-cancel when a seller is suspended.
    CANCELLED: ["ADMIN"],
  },
  FAILED_DELIVERY: {
    SHIPPED: ["SELLER", "ADMIN"],
    CANCELLED: ["SELLER", "ADMIN"],
  },
  DELIVERED: {},
  CANCELLED: {},
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: OrderActor): boolean {
  const allowed = TRANSITIONS[from][to];
  return allowed ? allowed.includes(actor) : false;
}

export function allowedTransitions(from: OrderStatus, actor: OrderActor): OrderStatus[] {
  return (Object.keys(TRANSITIONS[from]) as OrderStatus[]).filter((to) =>
    canTransition(from, to, actor),
  );
}
