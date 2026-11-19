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

  it("validates home hero and highlights keys", () => {
    const byKey = new Map(SETTINGS_REGISTRY.map((setting) => [setting.key, setting]));
    expect(byKey.get("home.highlights.enabled")).toMatchObject({
      default: true,
      group: "home",
      isPublic: true,
      wired: true,
    });
    expect(byKey.get("home.highlights.autoplay")).toMatchObject({ default: false });
    expect(byKey.get("home.highlights.intervalSeconds")).toMatchObject({ default: 6 });
    expect(byKey.get("home.highlights.maxSlides")).toMatchObject({ default: 6 });

    expect(() =>
      validateSettingValue("home.hero.chips", [
        { labelBn: "ইন্ডোর", labelEn: "Indoor", href: "/products?isIndoor=true" },
      ]),
    ).not.toThrow();
    expect(() =>
      validateSettingValue("home.hero.chips", [
        { labelBn: "খারাপ", labelEn: "Bad", href: "javascript:alert(1)" },
      ]),
    ).toThrow(/same-site/);
    expect(() =>
      validateSettingValue("home.hero.chips", [
        { labelBn: "খারাপ", labelEn: "Bad", href: "//evil.example" },
      ]),
    ).toThrow(/same-site/);
    expect(() =>
      validateSettingValue(
        "home.hero.chips",
        Array.from({ length: 9 }, (_, index) => ({
          labelBn: `চিপ ${index}`,
          labelEn: `Chip ${index}`,
          href: "/products",
        })),
      ),
    ).toThrow(/at most 8/);
    expect(() => validateSettingValue("home.highlights.intervalSeconds", 3)).toThrow(/4–12/);
    expect(() => validateSettingValue("home.highlights.maxSlides", 11)).toThrow(/1–10/);
    expect(() =>
      validateSettingValue("home.hero.image", {
        url: "https://res.cloudinary.com/demo/image/upload/a.webp",
        mobileUrl: "",
        altBn: "হিরো",
        altEn: "Hero",
        focalX: 50,
        focalY: 40,
      }),
    ).not.toThrow();
    expect(() =>
      validateSettingValue("home.hero.image", { url: "data:text/html,x" }),
    ).toThrow(/same-site|https/);
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
