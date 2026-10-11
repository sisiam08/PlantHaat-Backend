import { createHash } from "node:crypto";

export const RANDOM_SEED_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const RANDOM_SEED_BUCKET_MS = 15 * 60 * 1000;
export const RANDOM_RANK_LENGTH = 16; // first 8 bytes of sha256, hex-encoded

/** Seed derived from the current 15-minute time bucket (base36). */
export function defaultRandomSeed(now: number = Date.now()): string {
  return Math.floor(now / RANDOM_SEED_BUCKET_MS).toString(36);
}

export interface RankedId {
  id: string;
  rank: string;
}

/** Deterministic rank = hex of the first 8 bytes of sha256(seed + ":" + id). */
export function rankOf(seed: string, id: string): string {
  return createHash("sha256").update(`${seed}:${id}`).digest("hex").slice(0, RANDOM_RANK_LENGTH);
}

export function rankIds(seed: string, ids: readonly string[]): RankedId[] {
  return ids
    .map((id) => ({ id, rank: rankOf(seed, id) }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export interface CursorPayload {
  r: string;
  id: string;
}

export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid cursor");
    this.name = "InvalidCursorError";
  }
}

export function encodeCursor(item: RankedId): string {
  return Buffer.from(JSON.stringify({ r: item.rank, id: item.id }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): CursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCursorError();
  }
  const candidate = parsed as Partial<CursorPayload> | null;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    typeof candidate.r !== "string" ||
    !new RegExp(`^[0-9a-f]{${RANDOM_RANK_LENGTH}}$`).test(candidate.r) ||
    typeof candidate.id !== "string" ||
    candidate.id.length === 0
  ) {
    throw new InvalidCursorError();
  }
  return { r: candidate.r, id: candidate.id };
}

export interface CursorPage {
  ids: string[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Returns the first `limit` ranked ids strictly after the cursor's `(rank, id)`.
 * `hasMore` is true when further items exist beyond the returned page.
 */
export function cursorPage(
  ranked: readonly RankedId[],
  limit: number,
  cursor?: CursorPayload,
): CursorPage {
  let startIndex = 0;
  if (cursor) {
    const index = ranked.findIndex(
      (item) => item.rank > cursor.r || (item.rank === cursor.r && item.id > cursor.id),
    );
    startIndex = index === -1 ? ranked.length : index;
  }

  const slice = ranked.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < ranked.length;
  const last = slice.at(-1);
  return {
    ids: slice.map((item) => item.id),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    hasMore,
  };
}
