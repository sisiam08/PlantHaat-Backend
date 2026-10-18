import type { Prisma } from "../../generated/prisma/client";
import { InvalidCursorError } from "./random-feed";

const CURSOR_VERSION = 2;

export interface CursorKeyDef {
  field: string; // Prisma Product scalar field
  dir: "asc" | "desc";
  type: "date" | "number" | "string";
  nullable: boolean;
}

/**
 * `(sortKey, …, id)` keyset definitions per deterministic sort. The id key is
 * always last so pagination is exact; directions match the offset-mode
 * `orderBy` (with id added as the final tie-breaker).
 */
export const CURSOR_KEYS: Record<string, CursorKeyDef[]> = {
  newest: [
    { field: "publishedAt", dir: "desc", type: "date", nullable: true },
    { field: "createdAt", dir: "desc", type: "date", nullable: false },
    { field: "id", dir: "desc", type: "string", nullable: false },
  ],
  price_asc: [
    { field: "minPrice", dir: "asc", type: "number", nullable: true },
    { field: "createdAt", dir: "desc", type: "date", nullable: false },
    { field: "id", dir: "asc", type: "string", nullable: false },
  ],
  price_desc: [
    { field: "minPrice", dir: "desc", type: "number", nullable: true },
    { field: "createdAt", dir: "desc", type: "date", nullable: false },
    { field: "id", dir: "desc", type: "string", nullable: false },
  ],
  popular: [
    { field: "soldCount", dir: "desc", type: "number", nullable: false },
    { field: "createdAt", dir: "desc", type: "date", nullable: false },
    { field: "id", dir: "desc", type: "string", nullable: false },
  ],
  rating: [
    { field: "ratingAvg", dir: "desc", type: "number", nullable: true },
    { field: "ratingCount", dir: "desc", type: "number", nullable: false },
    { field: "id", dir: "desc", type: "string", nullable: false },
  ],
};

/** orderBy that matches the keyset definitions exactly (incl. the id tie-break). */
export function cursorOrderBy(sort: string): Prisma.ProductOrderByWithRelationInput[] {
  const keys = CURSOR_KEYS[sort];
  if (!keys) {
    throw new Error(`No cursor keys for sort "${sort}"`);
  }
  return keys.map((key) => ({ [key.field]: key.dir }));
}

/** Selects every (non-id) cursor field so the cursor can be built for any sort. */
export const CURSOR_ROW_SELECT: Prisma.ProductSelect = (() => {
  const fields = new Set<string>();
  for (const keys of Object.values(CURSOR_KEYS)) {
    for (const key of keys) {
      if (key.field !== "id") {
        fields.add(key.field);
      }
    }
  }
  return Object.fromEntries([...fields].map((field) => [field, true]));
})();

/** Row shape accepted by encodeProductCursor (Prisma scalars of the sorted fields). */
export type CursorRow = Record<string, string | number | Date | DecimalLike | null>;
interface DecimalLike {
  toString(): string;
}

/** Serializes a fetched row (with CURSOR_ROW_SELECT fields) into an opaque cursor. */
export function encodeProductCursor(sort: string, row: CursorRow): string {
  const keys = CURSOR_KEYS[sort];
  if (!keys) {
    throw new Error(`No cursor keys for sort "${sort}"`);
  }
  const values = keys.map(({ field }) => {
    const value: string | number | Date | DecimalLike | null = row[field];
    if (value === null || value === undefined) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return value.toString();
    }
    // Prisma.Decimal and friends — decimal-aware toString ("10.00").
    return value.toString();
  });
  return Buffer.from(
    JSON.stringify({ v: CURSOR_VERSION, s: sort, k: values, id: row.id }),
    "utf8",
  ).toString("base64url");
}

interface DecodedCursor {
  values: (string | null)[];
  id: string;
}

/** Validates and decodes a cursor for a sort (sort mismatch = tampered = invalid). */
export function decodeProductCursor(cursor: string, sort: string): DecodedCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCursorError();
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new InvalidCursorError();
  }
  const candidate = parsed as {
    v?: unknown;
    s?: unknown;
    k?: unknown;
    id?: unknown;
  };
  if (candidate.v !== CURSOR_VERSION || candidate.s !== sort || !Array.isArray(candidate.k)) {
    throw new InvalidCursorError();
  }
  const keys = CURSOR_KEYS[sort];
  if (candidate.k.length !== keys.length || typeof candidate.id !== "string") {
    throw new InvalidCursorError();
  }
  const values: (string | null)[] = [];
  for (const [index, key] of keys.entries()) {
    const raw: unknown = candidate.k[index];
    if (raw === null || raw === undefined) {
      if (!key.nullable) {
        throw new InvalidCursorError();
      }
      values.push(null);
      continue;
    }
    if (typeof raw !== "string") {
      throw new InvalidCursorError();
    }
    if (key.type === "number" && !/^-?\d+(\.\d+)?$/.test(raw)) {
      throw new InvalidCursorError();
    }
    if (
      key.type === "date" &&
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(raw)
    ) {
      throw new InvalidCursorError();
    }
    if (key.type === "string" && raw.length === 0) {
      throw new InvalidCursorError();
    }
    values.push(raw);
  }
  return { values, id: candidate.id };
}

function toDbValue(raw: string | null, key: CursorKeyDef): unknown {
  if (raw === null) {
    return null;
  }
  if (key.type === "number") {
    return Number(raw);
  }
  if (key.type === "date") {
    return new Date(raw);
  }
  return raw;
}

/**
 * Keyset condition over `(key_0 … key_n = id)` with correct asc/desc
 * tie-breaking and null-awareness (Prisma/Postgres: ASC = NULLS LAST,
 * DESC = NULLS FIRST).
 */
export function buildCursorWhere(sort: string, decoded: DecodedCursor): Prisma.ProductWhereInput {
  const keys = CURSOR_KEYS[sort];
  if (!keys) {
    throw new Error(`No cursor keys for sort "${sort}"`);
  }

  type Cond = Record<string, unknown>;

  const eq = (key: CursorKeyDef, raw: string | null): Cond => ({
    [key.field]: { equals: toDbValue(raw, key) },
  });
  const cmpAhead = (key: CursorKeyDef, raw: string): Cond => ({
    [key.field]: key.dir === "asc" ? { gt: toDbValue(raw, key) } : { lt: toDbValue(raw, key) },
  });
  const isNull = (key: CursorKeyDef): Cond => ({ [key.field]: { equals: null } });

  /** Branches covering every row strictly after the cursor, given the eq-prefix. */
  function after(index: number, prefix: Cond[]): Cond[] {
    if (index >= keys.length) {
      return [];
    }
    const key = keys[index];
    const raw = decoded.values[index];
    if (raw === null) {
      const nullBranches: Cond[] = [];
      if (key.nullable && key.dir === "desc") {
        // DESC sorts nulls first, so after the entire null run come *all*
        // non-null rows — without this branch they would be skipped forever
        // once a page boundary lands inside the null run (e.g. price_desc with
        // products that have no active variant).
        nullBranches.push({ AND: [...prefix, { [key.field]: { not: null } }] });
      }
      // Continue inside the null run via the deeper keys.
      nullBranches.push(...after(index + 1, [...prefix, isNull(key)]));
      return nullBranches;
    }
    const branches: Cond[] = [{ AND: [...prefix, cmpAhead(key, raw)] }];
    if (key.nullable && key.dir === "asc") {
      // ASC sorts nulls last: null rows follow every non-null row.
      branches.push({ AND: [...prefix, isNull(key)] });
    }
    branches.push(...after(index + 1, [...prefix, eq(key, raw)]));
    return branches;
  }

  return { OR: after(0, []) };
}
