import {
  generateComplaintTicket,
  generateOrderNumber,
  generatePayoutNumber,
  toShopOrderNumber,
} from "./order-number";

describe("order-number", () => {
  const now = new Date(Date.UTC(2026, 0, 5, 12, 0, 0));

  it("generates order numbers in the PH-YYMMDD-XXXXXX format", () => {
    expect(generateOrderNumber(now)).toMatch(/^PH-260105-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("generates complaint tickets", () => {
    expect(generateComplaintTicket(now)).toMatch(
      /^PC-260105-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/,
    );
  });

  it("generates payout numbers", () => {
    expect(generatePayoutNumber(now)).toMatch(/^PY-260105-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("derives shop order numbers from the parent order number", () => {
    expect(toShopOrderNumber("PH-260105-ABC123", 2)).toBe("PH-260105-ABC123-2");
  });
});
