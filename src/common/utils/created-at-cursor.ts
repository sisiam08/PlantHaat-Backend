/**
 * Opaque keyset cursor over `(createdAt desc, id desc)` — the shared paging
 * order for reviews, questions, answers and replies. Soft-deleted/missing rows
 * between pages are tolerated because the keyset never references the row again.
 */
const CURSOR_VERSION = 1;

export interface CreatedAtCursor {
  id: string;
  createdAt: Date;
}

export class InvalidCreatedAtCursorError extends Error {}

export function encodeCreatedAtCursor(id: string, createdAt: Date): string {
  return Buffer.from(
    JSON.stringify({ v: CURSOR_VERSION, id, t: createdAt.toISOString() }),
    "utf8",
  ).toString("base64url");
}

export function decodeCreatedAtCursor(cursor: string): CreatedAtCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCreatedAtCursorError();
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new InvalidCreatedAtCursorError();
  }
  const candidate = parsed as { v?: unknown; id?: unknown; t?: unknown };
  if (
    candidate.v !== CURSOR_VERSION ||
    typeof candidate.id !== "string" ||
    candidate.id.length === 0 ||
    typeof candidate.t !== "string"
  ) {
    throw new InvalidCreatedAtCursorError();
  }
  const createdAt = new Date(candidate.t);
  if (Number.isNaN(createdAt.getTime())) {
    throw new InvalidCreatedAtCursorError();
  }
  return { id: candidate.id, createdAt };
}

/** Prisma `where` fragment for rows strictly after the cursor row. */
export function createdAtKeyset(cursor: CreatedAtCursor): Record<string, unknown> {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
    ],
  };
}
