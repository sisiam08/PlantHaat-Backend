import { PASSWORD_PATTERN, PASSWORD_SPECIAL_PATTERN } from "./password";

describe("password policy", () => {
  it("accepts a password with length and all four character classes", () => {
    expect(PASSWORD_PATTERN.test("Str0ngPass!")).toBe(true);
    expect(PASSWORD_PATTERN.test("Abcdef1@")).toBe(true);
    expect(PASSWORD_SPECIAL_PATTERN.test("!")).toBe(true);
  });

  it("rejects missing length, case, number or special character", () => {
    expect(PASSWORD_PATTERN.test("Ab1!")).toBe(false);
    expect(PASSWORD_PATTERN.test("str0ngpass!")).toBe(false);
    expect(PASSWORD_PATTERN.test("STR0NGPASS!")).toBe(false);
    expect(PASSWORD_PATTERN.test("StrongPass!")).toBe(false);
    expect(PASSWORD_PATTERN.test("Str0ngPass")).toBe(false);
  });
});
