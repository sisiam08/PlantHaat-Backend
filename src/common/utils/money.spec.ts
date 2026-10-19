import { Prisma } from "../../generated/prisma/client";
import { lineCommission, lineTotal, money, sumMoney } from "./money";

/** Deterministic LCG so the property test is reproducible. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("money helper", () => {
  it("rounds half up to 2 dp", () => {
    expect(money("1.005").toFixed(2)).toBe("1.01");
    expect(money("2.675").toFixed(2)).toBe("2.68");
    expect(money("10.004").toFixed(2)).toBe("10.00");
  });

  it("computes commission per line and sums the rounded amounts", () => {
    const lines = [lineTotal("10.01", 3), lineTotal("7.77", 2)];
    const commission = lines.map((amount) => lineCommission(amount, "13.5"));
    expect(sumMoney(commission).toFixed(2)).toBe(
      commission.reduce((sum, value) => sum + Number(value), 0).toFixed(2),
    );
  });

  it("preserves the accounting invariants across random carts", () => {
    const random = lcg(20261019);
    for (let run = 0; run < 300; run += 1) {
      const shops = 1 + Math.floor(random() * 4);
      const shopTotals: Prisma.Decimal[] = [];
      let commissionTotal = new Prisma.Decimal(0);
      let sellerNetTotal = new Prisma.Decimal(0);
      for (let shop = 0; shop < shops; shop += 1) {
        const lineCount = 1 + Math.floor(random() * 4);
        const rate = (random() * 20).toFixed(2);
        const lineTotals: Prisma.Decimal[] = [];
        const lineCommissions: Prisma.Decimal[] = [];
        for (let line = 0; line < lineCount; line += 1) {
          const unitPrice = (random() * 5000 + 1).toFixed(2);
          const quantity = 1 + Math.floor(random() * 6);
          const total = lineTotal(unitPrice, quantity);
          lineTotals.push(total);
          lineCommissions.push(lineCommission(total, rate));
        }
        const subtotal = sumMoney(lineTotals);
        const delivery = money((random() * 200).toFixed(2));
        const shopTotal = money(subtotal.plus(delivery));
        const commission = sumMoney(lineCommissions);
        const sellerNet = money(shopTotal.minus(commission));

        // commission + seller net = shop total
        expect(money(commission.plus(sellerNet)).equals(shopTotal)).toBe(true);
        // subtotal is the sum of rounded line totals
        expect(subtotal.equals(sumMoney(lineTotals))).toBe(true);

        shopTotals.push(shopTotal);
        commissionTotal = commissionTotal.plus(commission);
        sellerNetTotal = sellerNetTotal.plus(sellerNet);
      }

      // order grand total = sum of shop totals
      const grandTotal = sumMoney(shopTotals);
      expect(grandTotal.equals(sumMoney(shopTotals))).toBe(true);
      // commission + seller net over the whole order = grand total
      expect(money(commissionTotal.plus(sellerNetTotal)).equals(grandTotal)).toBe(true);
    }
  });
});
