import {
  blendHex,
  contrastRatio,
  isSafeHighlightLink,
  validateHighlightInput,
  type HighlightInput,
} from "./highlights.validation";

const base: HighlightInput = {
  imageUrl: "https://res.cloudinary.com/demo/image/upload/banner.webp",
  imageWidth: 1920,
  imageHeight: 640,
  overlayEnabled: false,
  buttonEnabled: false,
  focalX: 50,
  focalY: 50,
};

describe("highlights validation", () => {
  it("allows only same-site paths or https links", () => {
    expect(isSafeHighlightLink("/products?sort=newest")).toBe(true);
    expect(isSafeHighlightLink("https://example.com/sale")).toBe(true);
    expect(isSafeHighlightLink("javascript:alert(1)")).toBe(false);
    expect(isSafeHighlightLink("data:text/html,x")).toBe(false);
    expect(isSafeHighlightLink("//evil.example/x")).toBe(false);
    expect(isSafeHighlightLink("http://example.com")).toBe(false);
  });

  it("accepts https and local test upload URLs, blocks plain http", () => {
    expect(
      validateHighlightInput(
        { ...base, imageUrl: "https://res.cloudinary.com/demo/image/upload/a.webp" },
        {},
      ).warnings,
    ).toEqual([]);
    expect(
      validateHighlightInput(
        { ...base, imageUrl: "http://localhost:5001/uploads/banners/x.webp" },
        {},
      ).warnings,
    ).toEqual([]);
    expect(() =>
      validateHighlightInput({ ...base, imageUrl: "http://evil.example/x.webp" }, {}),
    ).toThrow(/uploaded/);
  });

  it("computes WCAG contrast and blends the scrim over an estimated image", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrastRatio("#0B2116", "#EFE7D2")).toBeGreaterThan(10);
    expect(blendHex("#000000", "#777777", 100)).toBe("#000000");
    expect(blendHex("#000000", "#777777", 0)).toBe("#777777");
  });

  it("rejects unsafe links, bad colors and HTML text", () => {
    expect(() => validateHighlightInput({ ...base, linkUrl: "javascript:x" }, {})).toThrow(
      /same-site/,
    );
    expect(() => validateHighlightInput({ ...base, buttonHref: "//evil" }, {})).toThrow(
      /same-site/,
    );
    expect(() => validateHighlightInput({ ...base, textColor: "red" }, {})).toThrow(/#RRGGBB/);
    expect(() =>
      validateHighlightInput({ ...base, overlayEnabled: true, headlineBn: "<b>x</b>" }, {}),
    ).toThrow(/HTML/);
  });

  it("enforces text limits and schedule order", () => {
    expect(() =>
      validateHighlightInput(
        { ...base, overlayEnabled: true, headlineEn: "x".repeat(61) },
        {},
      ),
    ).toThrow(/60/);
    expect(() =>
      validateHighlightInput(
        {
          ...base,
          startsAt: "2026-11-20T00:00:00.000Z",
          endsAt: "2026-11-19T00:00:00.000Z",
        },
        {},
      ),
    ).toThrow(/after/);
  });

  it("blocks unreadable overlay text at maximum scrim, warns earlier", () => {
    expect(() =>
      validateHighlightInput(
        {
          ...base,
          overlayEnabled: true,
          headlineEn: "Hello",
          scrimColor: "#FFFFFF",
          scrimOpacity: 95,
          textColor: "#FFFF00",
        },
        {},
      ),
    ).toThrow(/contrast/i);
    const warned = validateHighlightInput(
      {
        ...base,
        overlayEnabled: true,
        headlineEn: "Hello",
        scrimColor: "#FFFFFF",
        scrimOpacity: 40,
        textColor: "#FFFF00",
      },
      {},
    );
    expect(warned.warnings.some((warning) => warning.includes("contrast"))).toBe(true);
  });

  it("blocks custom button colors below 3:1", () => {
    expect(() =>
      validateHighlightInput(
        {
          ...base,
          overlayEnabled: false,
          buttonEnabled: true,
          buttonLabelBn: "কিনুন",
          buttonLabelEn: "Shop",
          buttonHref: "/products",
          buttonStyle: "custom",
          buttonBgColor: "#FFFF00",
          buttonTextColor: "#FFFFFF",
        },
        {},
      ),
    ).toThrow(/3:1/);
  });

  it("warns but does not block an off-aspect image", () => {
    const result = validateHighlightInput(
      { ...base, imageWidth: 1000, imageHeight: 1000 },
      { desktop: { width: 1000, height: 1000 } },
    );
    expect(result.warnings.some((warning) => warning.includes("3:1"))).toBe(true);
  });
});
