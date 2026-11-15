import { jest } from "@jest/globals";

﻿import {
  SETTINGS_REGISTRY,
  SETTING_DEFAULTS,
  maskSensitive,
  publicSettingKeys,
  validateSettingValue,
  validateSettingsMap,
} from "./settings-registry";

describe("settings registry", () => {
  it("has unique keys, defaults, types, labels", () => {
    const keys = new Set<string>();
    for (const setting of SETTINGS_REGISTRY) {
      expect(keys.has(setting.key)).toBe(false);
      keys.add(setting.key);
      expect(setting.default).not.toBeUndefined();
      expect(["boolean", "number", "string", "json"]).toContain(setting.type);
      expect(setting.labelEn.length).toBeGreaterThan(0);
      expect(setting.labelBn.length).toBeGreaterThan(0);
      expect(SETTING_DEFAULTS[setting.key]).toEqual(setting.default);
    }
  });

  it("rejects invalid business values", () => {
    expect(() => validateSettingValue("payment.bkash.number", "12345")).toThrow(/Bangladesh/);
    expect(() => validateSettingValue("payment.expiryHours", 0)).toThrow(/expiry/);
    expect(() => validateSettingValue("commission.default", 101)).toThrow(/Commission/);
    expect(() => validateSettingValue("commission.default", -1)).toThrow(/Commission/);
    expect(() => validateSettingValue("return.windowHours", -2)).toThrow(/Return/);
    expect(() =>
      validateSettingsMap(
        { "payment.cod.enabled": false, "payment.advance.enabled": false },
        {},
      ),
    ).toThrow(/COD cannot be disabled/);
    expect(() =>
      validateSettingsMap({ "payment.nagad.enabled": true }, {}),
    ).toThrow(/valid receiving number/);
    expect(() =>
      validateSettingsMap(
        {
          "payment.cod.enabled": false,
          "payment.advance.enabled": true,
          "payment.bkash.enabled": true,
          "payment.bkash.number": "01712345678",
        },
        {},
      ),
    ).toThrow(/COD cannot be disabled/);
    expect(() =>
      validateSettingsMap({ "payment.advance.enabled": true }, {}),
    ).toThrow(/requires at least one enabled provider/);
  });

  it("never exposes a key that is both public and sensitive", () => {
    for (const setting of SETTINGS_REGISTRY) {
      expect(Boolean(setting.isPublic && setting.isSensitive)).toBe(false);
    }
  });

  it("public contract excludes private and sensitive keys", () => {
    const keys = publicSettingKeys();
    expect(keys).toContain("payment.advance.enabled");
    for (const key of [
      "payment.bkash.number",
      "payment.nagad.number",
      "commission.default",
      "wallet.codDuesLimit",
      "payout.minimumAmount",
      "payout.methods",
    ]) expect(keys).not.toContain(key);
  });

  it("masks sensitive values only", () => {
    const masked = maskSensitive({
      "payment.bkash.number": "01712345678",
      "payment.cod.enabled": true,
    });
    expect(masked["payment.bkash.number"]).toBe("••••••");
    expect(masked["payment.cod.enabled"]).toBe(true);
  });
});
