/**
 * Minimal HTML stripping for user-generated text. The product stores plain text
 * only, so tags/entities are removed before validation and persistence; no HTML
 * is ever rendered (the frontend also escapes).
 */
export function stripHtml(value: string): string {
  return value
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
