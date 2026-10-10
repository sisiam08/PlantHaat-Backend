import slugify from "slugify";

import { randomChars } from "./crypto";

const SLUG_SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function toSlug(input: string): string {
  const slug = slugify(input, { lower: true, strict: true, trim: true });
  return slug.length > 0 ? slug : randomChars(8, SLUG_SUFFIX_ALPHABET);
}

export function toUniqueSlug(input: string): string {
  return `${toSlug(input)}-${randomChars(4, SLUG_SUFFIX_ALPHABET)}`;
}
