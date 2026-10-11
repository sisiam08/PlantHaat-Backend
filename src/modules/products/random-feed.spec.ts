import {
  cursorPage,
  defaultRandomSeed,
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  RANDOM_SEED_BUCKET_MS,
  rankIds,
  rankOf,
} from "./random-feed";

const IDS = Array.from({ length: 25 }, (_, index) => `id-${index.toString().padStart(2, "0")}`);

describe("random-feed", () => {
  it("derives a stable seed from the 15-minute bucket", () => {
    const bucket = 12_000;
    const now = bucket * RANDOM_SEED_BUCKET_MS + 1000;
    expect(defaultRandomSeed(now)).toBe(defaultRandomSeed(bucket * RANDOM_SEED_BUCKET_MS));
    expect(defaultRandomSeed(now)).not.toBe(defaultRandomSeed((bucket + 1) * RANDOM_SEED_BUCKET_MS));
    expect(defaultRandomSeed(now)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("ranks deterministically and uniquely per (seed, id)", () => {
    expect(rankOf("seed", "id-1")).toBe(rankOf("seed", "id-1"));
    expect(rankOf("seed", "id-1")).toMatch(/^[0-9a-f]{16}$/);
    expect(rankOf("seed", "id-1")).not.toBe(rankOf("other", "id-1"));

    const ranked = rankIds("seed", IDS);
    expect(ranked).toHaveLength(IDS.length);
    expect(new Set(ranked.map((item) => item.id)).size).toBe(IDS.length);
    expect(rankIds("seed", IDS).map((item) => item.id)).toEqual(ranked.map((item) => item.id));
  });

  it("gives different orders for different seeds", () => {
    const a = rankIds("seed-a", IDS).map((item) => item.id);
    const b = rankIds("seed-b", IDS).map((item) => item.id);
    expect(a).not.toEqual(b);
  });

  it("round-trips cursors and rejects malformed ones", () => {
    const ranked = rankIds("seed", IDS);
    const encoded = encodeCursor(ranked[3]);
    expect(decodeCursor(encoded)).toEqual({ r: ranked[3].rank, id: ranked[3].id });

    expect(() => decodeCursor("not-base64-json")).toThrow(InvalidCursorError);
    expect(() =>
      decodeCursor(Buffer.from(JSON.stringify({ r: "ZZZ", id: "id-1" })).toString("base64url")),
    ).toThrow(InvalidCursorError);
    expect(() =>
      decodeCursor(Buffer.from(JSON.stringify({ r: ranked[0].rank })).toString("base64url")),
    ).toThrow(InvalidCursorError);
  });

  it("walks every id exactly once across pages", () => {
    const ranked = rankIds("seed", IDS);
    const limit = 7;
    const collected: string[] = [];
    let cursor = undefined as ReturnType<typeof decodeCursor> | undefined;
    let pages = 0;

    for (;;) {
      const page = cursorPage(ranked, limit, cursor);
      collected.push(...page.ids);
      pages += 1;
      if (!page.hasMore || page.nextCursor === null) break;
      cursor = decodeCursor(page.nextCursor);
      expect(pages).toBeLessThan(10);
    }

    expect(collected).toEqual(ranked.map((item) => item.id));
    expect(new Set(collected).size).toBe(IDS.length);
  });

  it("returns no nextCursor on the final page", () => {
    const ranked = rankIds("seed", IDS);
    const page = cursorPage(ranked, IDS.length);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
