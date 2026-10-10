import { randomBytes } from "node:crypto";

import { decryptAesGcm, encryptAesGcm, randomToken, safeEqualHex, sha256Hex } from "./crypto";

describe("crypto", () => {
  const key = randomBytes(32).toString("base64");

  it("hashes deterministically with sha256", () => {
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
    expect(sha256Hex("hello")).toHaveLength(64);
  });

  it("generates url-safe random tokens", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toBe(randomToken());
  });

  it("round-trips AES-256-GCM encryption", () => {
    const plaintext = "01712345678";
    const payload = encryptAesGcm(plaintext, key);
    expect(payload).not.toContain(plaintext);
    expect(decryptAesGcm(payload, key)).toBe(plaintext);
  });

  it("compares hex digests in constant time", () => {
    const a = sha256Hex("value");
    expect(safeEqualHex(a, a)).toBe(true);
    expect(safeEqualHex(a, sha256Hex("other"))).toBe(false);
  });
});
