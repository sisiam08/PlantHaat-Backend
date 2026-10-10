import { isValidBdPhone, normalizeBdPhone } from "./phone";

describe("phone", () => {
  it("accepts the common Bangladeshi phone formats", () => {
    expect(isValidBdPhone("01712345678")).toBe(true);
    expect(isValidBdPhone("+8801712345678")).toBe(true);
    expect(isValidBdPhone("8801712345678")).toBe(true);
    expect(isValidBdPhone("01212345678")).toBe(false);
    expect(isValidBdPhone("0171234567")).toBe(false);
  });

  it("normalizes to +8801XXXXXXXXX", () => {
    expect(normalizeBdPhone("01712345678")).toBe("+8801712345678");
    expect(normalizeBdPhone("+880 1712-345678")).toBe("+8801712345678");
    expect(normalizeBdPhone("8801712345678")).toBe("+8801712345678");
  });

  it("throws on invalid numbers", () => {
    expect(() => normalizeBdPhone("0000")).toThrow();
  });
});
