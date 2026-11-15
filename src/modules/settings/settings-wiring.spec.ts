import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("settings wiring grep guard", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("complaints use return.windowHours, never the removed complaint key", () => {
    const source = read("src/modules/complaints/complaints.service.ts");
    expect(source).toContain('"return.windowHours"');
    expect(source).not.toContain("complaint.windowHours");
  });

  it("checkout still reads COD enabled and max amount from settings", () => {
    const source = read("src/modules/orders/orders.service.ts");
    expect(source).toContain('"payment.cod.enabled"');
    expect(source).toContain('"order.codMaxAmount"');
  });

  it("commission fallback still reads commission.default", () => {
    const source = read("src/modules/commissions/commissions.service.ts");
    expect(source).toContain('"commission.default"');
  });
});
