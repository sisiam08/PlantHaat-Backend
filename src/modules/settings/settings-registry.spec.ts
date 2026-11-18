import {
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
    ).toThrow(/Some settings are invalid/);
    expect(() =>
      validateSettingsMap({ "payment.nagad.enabled": true }, {}),
    ).toThrow(/Some settings are invalid/);
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
    ).not.toThrow();
    expect(() =>
      validateSettingsMap({ "payment.advance.enabled": true }, {}),
    ).toThrow(/Some settings are invalid/);
    expect(() => validateSettingValue("security.access.ttlMinutes", 0)).toThrow(/Access token/);
    expect(() => validateSettingValue("security.access.ttlMinutes", 1441)).toThrow(/Access token/);
    expect(() => validateSettingValue("security.refresh.customer.days", 0)).toThrow(/lifetime/);
    expect(() => validateSettingValue("security.refresh.admin.maxDays", 731)).toThrow(
      /Maximum session/,
    );
    expect(() => validateSettingValue("security.refresh.graceSeconds", 301)).toThrow(/grace/);
    expect(() =>
      validateSettingsMap(
        { "security.refresh.customer.days": 30, "security.refresh.customer.maxDays": 10 },
        {},
      ),
    ).toThrow(/Some settings are invalid/);
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
      "security.access.ttlMinutes",
      "security.refresh.customer.days",
      "security.refresh.graceSeconds",
    ]) expect(keys).not.toContain(key);
  });

  it("ships the role-based session defaults in the security group", () => {
    const byKey = new Map(SETTINGS_REGISTRY.map((setting) => [setting.key, setting]));
    expect(byKey.get("security.access.ttlMinutes")).toMatchObject({
      default: 15,
      group: "security",
      wired: true,
    });
    expect(byKey.get("security.refresh.customer.days")).toMatchObject({
      default: 30,
      group: "security",
    });
    expect(byKey.get("security.refresh.customer.maxDays")).toMatchObject({ default: 90 });
    expect(byKey.get("security.refresh.seller.days")).toMatchObject({ default: 14 });
    expect(byKey.get("security.refresh.seller.maxDays")).toMatchObject({ default: 60 });
    expect(byKey.get("security.refresh.admin.days")).toMatchObject({ default: 7 });
    expect(byKey.get("security.refresh.admin.maxDays")).toMatchObject({ default: 30 });
    expect(byKey.get("security.refresh.graceSeconds")).toMatchObject({ default: 30 });
    for (const key of byKey.keys()) {
      if (key.startsWith("security.")) {
        expect(byKey.get(key)?.isPublic).not.toBe(true);
      }
    }
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
