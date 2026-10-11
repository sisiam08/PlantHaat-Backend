import sharp from "sharp";

import {
  DEFAULT_IMAGE_MAX_EDGE,
  detectImageMime,
  PRODUCT_IMAGE_MAX_EDGE,
  reencodeImage,
} from "./image.util";

describe("image.util", () => {
  it("detects PNG magic bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(detectImageMime(png)).toBe("image/png");
  });

  it("detects JPEG magic bytes", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(detectImageMime(jpeg)).toBe("image/jpeg");
  });

  it("detects WebP (RIFF....WEBP)", () => {
    const webp = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from("WEBP", "ascii"),
    ]);
    expect(detectImageMime(webp)).toBe("image/webp");
  });

  it("returns undefined for non-images", () => {
    expect(detectImageMime(Buffer.from("hello world"))).toBeUndefined();
  });

  it("re-encodes to webp and strips the original container", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();

    const webp = await reencodeImage(png);
    expect(detectImageMime(webp)).toBe("image/webp");
  });

  it("caps the long edge at the default limit for non-product purposes", async () => {
    const wide = await sharp({
      create: { width: 3200, height: 1600, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .png()
      .toBuffer();

    const metadata = await sharp(await reencodeImage(wide)).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(DEFAULT_IMAGE_MAX_EDGE);
    expect(metadata.height).toBeLessThanOrEqual(DEFAULT_IMAGE_MAX_EDGE);
  });

  it("keeps product images up to the higher 2000px long edge", async () => {
    const wide = await sharp({
      create: { width: 3200, height: 1600, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .png()
      .toBuffer();

    const metadata = await sharp(
      await reencodeImage(wide, { maxEdge: PRODUCT_IMAGE_MAX_EDGE }),
    ).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(PRODUCT_IMAGE_MAX_EDGE);
    expect(metadata.height).toBeLessThanOrEqual(PRODUCT_IMAGE_MAX_EDGE);
  });

  it("never upscales images smaller than the long-edge cap", async () => {
    const small = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .png()
      .toBuffer();

    const metadata = await sharp(
      await reencodeImage(small, { maxEdge: PRODUCT_IMAGE_MAX_EDGE }),
    ).metadata();
    expect(metadata.width).toBe(400);
    expect(metadata.height).toBe(300);
  });
});
