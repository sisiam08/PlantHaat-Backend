import {
  buildProductionBaselineChanges,
  PRODUCTION_SETTINGS_BASELINE,
} from "./production-baseline";

describe("production settings baseline", () => {
  it("turns every provider off and empties both numbers while keeping COD on", () => {
    expect(PRODUCTION_SETTINGS_BASELINE).toMatchObject({
      "payment.advance.enabled": false,
      "payment.bkash.enabled": false,
      "payment.bkash.number": "",
      "payment.nagad.enabled": false,
      "payment.nagad.number": "",
      "payment.cod.enabled": true,
    });
  });

  it("prints a masked diff and no full number", () => {
    const changes = buildProductionBaselineChanges({
      "payment.advance.enabled": true,
      "payment.bkash.enabled": true,
      "payment.bkash.number": "01712345678",
      "payment.nagad.enabled": false,
      "payment.nagad.number": "",
      "payment.cod.enabled": true,
    });
    const bKash = changes.find((change) => change.key === "payment.bkash.number");
    expect(bKash?.current).toBe("017***78");
    expect(JSON.stringify(changes)).not.toContain("01712345678");
    expect(changes.find((change) => change.key === "payment.advance.enabled")?.next).toBe("OFF");
    expect(changes.find((change) => change.key === "payment.cod.enabled")).toBeUndefined();
  });
});
