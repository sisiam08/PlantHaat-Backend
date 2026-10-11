import sharp from "sharp";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Long-edge cap for every upload purpose except product images. */
export const DEFAULT_IMAGE_MAX_EDGE = 1600;
/** Product images keep more resolution so the product page can zoom. */
export const PRODUCT_IMAGE_MAX_EDGE = 2000;
export const DEFAULT_IMAGE_QUALITY = 82;
export const PRODUCT_IMAGE_QUALITY = 80;

export interface ReencodeOptions {
  /** Long edge in pixels; never upscales smaller images. */
  maxEdge?: number;
  quality?: number;
}

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export function detectImageMime(buffer: Buffer): AllowedImageMime | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

export async function reencodeImage(
  buffer: Buffer,
  options: ReencodeOptions = {},
): Promise<Buffer> {
  const { maxEdge = DEFAULT_IMAGE_MAX_EDGE, quality = DEFAULT_IMAGE_QUALITY } = options;
  return sharp(buffer)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}
