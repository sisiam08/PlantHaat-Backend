import { detectImageMime, type AllowedImageMime } from "./image.util";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type DocumentKind = "pdf" | AllowedImageMime;

export function detectDocumentKind(buffer: Buffer): DocumentKind | undefined {
  if (buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-") {
    return "pdf";
  }
  return detectImageMime(buffer);
}

export function documentExtension(kind: DocumentKind): string {
  switch (kind) {
    case "pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

export function documentContentType(kind: DocumentKind): string {
  return kind === "pdf" ? "application/pdf" : kind;
}
