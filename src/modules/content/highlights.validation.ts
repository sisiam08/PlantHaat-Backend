import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";

export const HIGHLIGHT_PLACEMENT = "HOME_HIGHLIGHTS";
export const HIGHLIGHT_POSITIONS = [
  "TOP_LEFT",
  "TOP_CENTER",
  "TOP_RIGHT",
  "CENTER_LEFT",
  "CENTER",
  "CENTER_RIGHT",
  "BOTTOM_LEFT",
  "BOTTOM_CENTER",
  "BOTTOM_RIGHT",
] as const;
export const HIGHLIGHT_ALIGNS = ["left", "center", "right"] as const;
export const HIGHLIGHT_BUTTON_STYLES = [
  "primary",
  "secondary",
  "outline-light",
  "outline-dark",
  "custom",
] as const;

export const HEADLINE_MAX = 60;
export const SUBTEXT_MAX = 140;
export const BUTTON_LABEL_MAX = 24;
export const MIN_DESKTOP_WIDTH = 1200;
export const MIN_MOBILE_WIDTH = 640;
export const DESKTOP_RATIO_MIN = 2.4;
export const DESKTOP_RATIO_MAX = 3.6;
export const MOBILE_RATIO_MIN = 1.3;
export const MOBILE_RATIO_MAX = 2;

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface HighlightInput {
  title?: string | null;
  imageUrl: string;
  imagePublicId?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  mobileImageUrl?: string | null;
  mobileImagePublicId?: string | null;
  mobileImageWidth?: number | null;
  mobileImageHeight?: number | null;
  imageAltBn?: string | null;
  imageAltEn?: string | null;
  linkUrl?: string | null;
  placement?: string;
  sortOrder?: number;
  isActive?: boolean;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  focalX?: number;
  focalY?: number;
  mobileFocalX?: number;
  mobileFocalY?: number;
  overlayEnabled?: boolean;
  headlineBn?: string | null;
  headlineEn?: string | null;
  subtextBn?: string | null;
  subtextEn?: string | null;
  textColor?: string | null;
  scrimColor?: string | null;
  scrimOpacity?: number;
  desktopPosition?: string | null;
  mobilePosition?: string | null;
  desktopAlign?: string | null;
  mobileAlign?: string | null;
  buttonEnabled?: boolean;
  buttonLabelBn?: string | null;
  buttonLabelEn?: string | null;
  buttonHref?: string | null;
  buttonStyle?: string | null;
  buttonBgColor?: string | null;
  buttonTextColor?: string | null;
  openInNewTab?: boolean;
}

/** Same-site relative path or an absolute https URL. */
export function isSafeHighlightLink(value: string | null | undefined): boolean {
  if (!value) return false;
  const href = value.trim();
  if (href === "" || href.startsWith("//")) return false;
  if (href.startsWith("/")) return true;
  return /^https:\/\/[^\s]+$/i.test(href);
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/**
 * Cloudinary https URLs, same-site /uploads paths and the local test storage
 * origin are the only image sources we own.
 */
export function isOwnedUploadUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  if (value.startsWith("/uploads/")) return true;
  if (isSafeHighlightLink(value)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/uploads\//i.test(value);
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

/** Blends `top` over `bottom` at the given opacity (0-100). */
export function blendHex(top: string, bottom: string, opacity: number): string {
  const alpha = Math.min(100, Math.max(0, opacity)) / 100;
  const a = hexToRgb(top);
  const b = hexToRgb(bottom);
  const mix = a.map((value, index) => Math.round(value * alpha + b[index] * (1 - alpha)));
  return `#${mix.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

const NEUTRAL_IMAGE = "#777777";
const DEFAULT_TEXT = "#EFE7D2";

function plainText(value: string | null | undefined, field: string, max: number): void {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string") {
    throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, `${field} must be text`);
  }
  if (value.length > max) {
    throw AppException.badRequest(
      ErrorCode.VALIDATION_FAILED,
      `${field} must be ${max} characters or fewer`,
      { [field]: `${max} characters or fewer` },
    );
  }
  if (value.includes("<") || value.includes(">")) {
    throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, `${field} cannot contain HTML`, {
      [field]: "Plain text only",
    });
  }
}

function assertColor(value: string | null | undefined, field: string): void {
  if (value === undefined || value === null || value === "") return;
  if (!isHexColor(value)) {
    throw AppException.badRequest(
      ErrorCode.VALIDATION_FAILED,
      `${field} must be a #RRGGBB color`,
      { [field]: "Use #RRGGBB" },
    );
  }
}

function assertPosition(value: string | null | undefined, field: string): void {
  if (value === undefined || value === null || value === "") return;
  if (!(HIGHLIGHT_POSITIONS as readonly string[]).includes(value)) {
    throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, `${field} is not a valid position`);
  }
}

function assertAlign(value: string | null | undefined, field: string): void {
  if (value === undefined || value === null || value === "") return;
  if (!(HIGHLIGHT_ALIGNS as readonly string[]).includes(value)) {
    throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, `${field} is not a valid alignment`);
  }
}

export interface HighlightValidationResult {
  warnings: string[];
  startsAt: Date | null;
  endsAt: Date | null;
}

/**
 * Server-side validation shared by create/update. Blocks unsafe links/colors,
 * malformed schedules and unreadable button text; aspect/dimension mismatches
 * are warnings because the focal-point crop can handle them.
 */
export function validateHighlightInput(
  input: HighlightInput,
  imageDimensions: {
    desktop?: { width?: number | null; height?: number | null };
    mobile?: { width?: number | null; height?: number | null };
  },
): HighlightValidationResult {
  const warnings: string[] = [];
  if (!input.imageUrl?.trim()) {
    throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "A desktop image is required");
  }
  if (!isOwnedUploadUrl(input.imageUrl)) {
    throw AppException.badRequest(
      ErrorCode.VALIDATION_FAILED,
      "Desktop image must be an uploaded image URL",
    );
  }
  if (input.mobileImageUrl && !isOwnedUploadUrl(input.mobileImageUrl)) {
    throw AppException.badRequest(
      ErrorCode.VALIDATION_FAILED,
      "Mobile image must be an uploaded image URL",
    );
  }
  if (input.linkUrl && !isSafeHighlightLink(input.linkUrl)) {
    throw AppException.badRequest(
      ErrorCode.VALIDATION_FAILED,
      "Slide link must be a same-site /path or an https URL",
      { linkUrl: "Blocked link scheme" },
    );
  }
  if (input.buttonHref && !isSafeHighlightLink(input.buttonHref)) {
    throw AppException.badRequest(
      ErrorCode.VALIDATION_FAILED,
      "Button link must be a same-site /path or an https URL",
      { buttonHref: "Blocked link scheme" },
    );
  }

  plainText(input.title, "title", 150);
  plainText(input.imageAltBn, "imageAltBn", 120);
  plainText(input.imageAltEn, "imageAltEn", 120);
  plainText(input.headlineBn, "headlineBn", HEADLINE_MAX);
  plainText(input.headlineEn, "headlineEn", HEADLINE_MAX);
  plainText(input.subtextBn, "subtextBn", SUBTEXT_MAX);
  plainText(input.subtextEn, "subtextEn", SUBTEXT_MAX);
  plainText(input.buttonLabelBn, "buttonLabelBn", BUTTON_LABEL_MAX);
  plainText(input.buttonLabelEn, "buttonLabelEn", BUTTON_LABEL_MAX);

  assertColor(input.textColor, "textColor");
  assertColor(input.scrimColor, "scrimColor");
  assertColor(input.buttonBgColor, "buttonBgColor");
  assertColor(input.buttonTextColor, "buttonTextColor");
  assertPosition(input.desktopPosition, "desktopPosition");
  assertPosition(input.mobilePosition, "mobilePosition");
  assertAlign(input.desktopAlign, "desktopAlign");
  assertAlign(input.mobileAlign, "mobileAlign");

  if (input.scrimOpacity !== undefined && (input.scrimOpacity < 0 || input.scrimOpacity > 100)) {
    throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Scrim opacity must be 0–100");
  }

  const startsAt = input.startsAt ? new Date(input.startsAt) : null;
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (startsAt && Number.isNaN(startsAt.getTime())) {
    throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Start time is invalid");
  }
  if (endsAt && Number.isNaN(endsAt.getTime())) {
    throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "End time is invalid");
  }
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw AppException.badRequest(
      ErrorCode.VALIDATION_FAILED,
      "End time must be after the start time",
    );
  }

  if (input.overlayEnabled) {
    const hasText = [input.headlineBn, input.headlineEn, input.subtextBn, input.subtextEn].some(
      (value) => (value ?? "").trim() !== "",
    );
    if (!hasText) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "Overlay is on but there is no headline or subtext",
      );
    }
    const scrim = input.scrimColor ?? "#0B2116";
    const opacity = input.scrimOpacity ?? 35;
    const text = input.textColor ?? DEFAULT_TEXT;
    const estimatedBackground = blendHex(scrim, NEUTRAL_IMAGE, opacity);
    const ratio = contrastRatio(text, estimatedBackground);
    if (ratio < 4.5) {
      const message = `Overlay text contrast is ${ratio.toFixed(1)}:1 against the estimated background; use a darker scrim or lighter text.`;
      if (opacity >= 90) {
        throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, message, {
          textColor: message,
        });
      }
      warnings.push(message);
    }
  }

  if (input.buttonEnabled) {
    if (!input.buttonHref || !isSafeHighlightLink(input.buttonHref)) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "Button needs a safe same-site or https link",
        { buttonHref: "Required" },
      );
    }
    if (!(input.buttonLabelBn ?? "").trim() || !(input.buttonLabelEn ?? "").trim()) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "Button needs Bangla and English labels",
      );
    }
    const style = input.buttonStyle ?? "primary";
    if (!(HIGHLIGHT_BUTTON_STYLES as readonly string[]).includes(style)) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Unknown button style");
    }
    if (style === "custom") {
      if (!isHexColor(input.buttonBgColor) || !isHexColor(input.buttonTextColor)) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          "Custom button needs #RRGGBB background and text colors",
        );
      }
      const ratio = contrastRatio(input.buttonTextColor, input.buttonBgColor);
      if (ratio < 3) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          `Button text contrast is ${ratio.toFixed(1)}:1; it must be at least 3:1`,
          { buttonTextColor: "Contrast below 3:1" },
        );
      }
      if (ratio < 4.5) {
        warnings.push(
          `Button text contrast is ${ratio.toFixed(1)}:1; 4.5:1 is safer for small labels.`,
        );
      }
    }
  }

  const desktop = {
    width: imageDimensions.desktop?.width ?? input.imageWidth ?? null,
    height: imageDimensions.desktop?.height ?? input.imageHeight ?? null,
  };
  if (desktop.width && desktop.height) {
    const ratio = desktop.width / desktop.height;
    if (ratio < DESKTOP_RATIO_MIN || ratio > DESKTOP_RATIO_MAX) {
      warnings.push(
        `Desktop image is ${desktop.width}×${desktop.height} (${ratio.toFixed(2)}:1); 3:1 (1920×640) is recommended. Focal-point cropping will be used.`,
      );
    }
    if (desktop.width < MIN_DESKTOP_WIDTH) {
      warnings.push(
        `Desktop image is ${desktop.width}px wide; at least ${MIN_DESKTOP_WIDTH}px is recommended for sharp hero crops.`,
      );
    }
  }
  const mobile = {
    width: imageDimensions.mobile?.width ?? input.mobileImageWidth ?? null,
    height: imageDimensions.mobile?.height ?? input.mobileImageHeight ?? null,
  };
  if (mobile.width && mobile.height) {
    const ratio = mobile.width / mobile.height;
    if (ratio < MOBILE_RATIO_MIN || ratio > MOBILE_RATIO_MAX) {
      warnings.push(
        `Mobile image is ${mobile.width}×${mobile.height} (${ratio.toFixed(2)}:1); 3:2 or 16:9 is recommended.`,
      );
    }
    if (mobile.width < MIN_MOBILE_WIDTH) {
      warnings.push(
        `Mobile image is ${mobile.width}px wide; at least ${MIN_MOBILE_WIDTH}px is recommended.`,
      );
    }
  }

  return { warnings, startsAt, endsAt };
}
