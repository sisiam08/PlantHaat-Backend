import { allowedTransitions, canTransition } from "./order-state-machine";

describe("order state machine", () => {
  it("allows the seller happy path", () => {
    expect(canTransition("PENDING", "CONFIRMED", "SELLER")).toBe(true);
    expect(canTransition("CONFIRMED", "PACKED", "SELLER")).toBe(true);
    expect(canTransition("PACKED", "SHIPPED", "SELLER")).toBe(true);
    expect(canTransition("SHIPPED", "DELIVERED", "SELLER")).toBe(true);
  });

  it("lets customers cancel only from PENDING", () => {
    expect(canTransition("PENDING", "CANCELLED", "CUSTOMER")).toBe(true);
    expect(canTransition("CONFIRMED", "CANCELLED", "CUSTOMER")).toBe(false);
    expect(canTransition("PACKED", "CANCELLED", "CUSTOMER")).toBe(false);
    expect(canTransition("SHIPPED", "CANCELLED", "CUSTOMER")).toBe(false);
  });

  it("lets admin override CONFIRMED/PACKED cancellations", () => {
    expect(canTransition("CONFIRMED", "CANCELLED", "ADMIN")).toBe(true);
    expect(canTransition("PACKED", "CANCELLED", "ADMIN")).toBe(true);
    expect(canTransition("DELIVERED", "CANCELLED", "ADMIN")).toBe(false);
  });

  it("lets only an admin bulk-cancel a shipped order", () => {
    expect(canTransition("SHIPPED", "CANCELLED", "ADMIN")).toBe(true);
    expect(canTransition("SHIPPED", "CANCELLED", "SELLER")).toBe(false);
    expect(canTransition("SHIPPED", "CANCELLED", "CUSTOMER")).toBe(false);
  });

  it("handles retries from FAILED_DELIVERY", () => {
    expect(canTransition("FAILED_DELIVERY", "SHIPPED", "SELLER")).toBe(true);
    expect(canTransition("FAILED_DELIVERY", "CANCELLED", "SELLER")).toBe(true);
  });

  it("does not allow a customer to confirm or ship", () => {
    expect(canTransition("PENDING", "CONFIRMED", "CUSTOMER")).toBe(false);
    expect(canTransition("PACKED", "SHIPPED", "CUSTOMER")).toBe(false);
  });

  it("treats terminal states as terminal", () => {
    expect(allowedTransitions("DELIVERED", "ADMIN")).toHaveLength(0);
    expect(allowedTransitions("CANCELLED", "ADMIN")).toHaveLength(0);
  });

  it("lists allowed transitions for an intermediate state", () => {
    expect(allowedTransitions("CONFIRMED", "SELLER")).toEqual(["PACKED", "CANCELLED"]);
    expect(allowedTransitions("PENDING", "CUSTOMER")).toEqual(["CANCELLED"]);
  });

  it("lets the system auto-cancel a pending order", () => {
    expect(canTransition("PENDING", "CANCELLED", "SYSTEM")).toBe(true);
    expect(canTransition("CONFIRMED", "CANCELLED", "SYSTEM")).toBe(false);
  });
});
