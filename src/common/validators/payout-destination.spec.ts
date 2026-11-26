import { payoutDestinationError } from "./payout-destination";

describe("payoutDestinationError", () => {
  it("accepts valid bKash and Nagad mobile numbers", () => {
    expect(payoutDestinationError("BKASH", "01712345678")).toBeNull();
    expect(payoutDestinationError("NAGAD", "+8801812345678")).toBeNull();
  });

  it("rejects invalid mobile numbers", () => {
    expect(payoutDestinationError("BKASH", "123456")).toMatch(/mobile/i);
    expect(payoutDestinationError("NAGAD", "0180000000")).toMatch(/mobile/i);
    expect(payoutDestinationError("BKASH", "017123456789")).toMatch(/mobile/i);
  });

  it("accepts 6-34 digit bank accounts with spaces/hyphens", () => {
    expect(payoutDestinationError("BANK", "1234-5678-9012")).toBeNull();
    expect(payoutDestinationError("BANK", "123456")).toBeNull();
  });

  it("rejects invalid bank accounts and unsupported methods", () => {
    expect(payoutDestinationError("BANK", "12ab")).toMatch(/bank/i);
    expect(payoutDestinationError("BANK", "12345")).toMatch(/bank/i);
    expect(payoutDestinationError("ROCKET", "01712345678")).toMatch(/unsupported/i);
  });
});
