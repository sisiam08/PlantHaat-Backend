export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    },
  };
}

export interface CursorPaginationMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
  /** Present only on the first page when `includeTotal=true` was requested. */
  total?: number;
}

export interface CursorPaginatedResult<T> {
  data: T[];
  meta: CursorPaginationMeta;
}

export function isCursorPaginatedResult(
  value: unknown,
): value is CursorPaginatedResult<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { data?: unknown; meta?: unknown };
  if (!Array.isArray(candidate.data) || typeof candidate.meta !== "object") {
    return false;
  }
  const meta = candidate.meta as Partial<CursorPaginationMeta>;
  return (
    typeof meta.limit === "number" &&
    (typeof meta.nextCursor === "string" || meta.nextCursor === null) &&
    typeof meta.hasMore === "boolean"
  );
}

export function isPaginatedResult(value: unknown): value is PaginatedResult<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { data?: unknown; meta?: unknown };
  if (!Array.isArray(candidate.data) || typeof candidate.meta !== "object") {
    return false;
  }
  const meta = candidate.meta as Partial<PaginationMeta>;
  return (
    typeof meta.page === "number" &&
    typeof meta.limit === "number" &&
    typeof meta.total === "number" &&
    typeof meta.totalPages === "number"
  );
}
