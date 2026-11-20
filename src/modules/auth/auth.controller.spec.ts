import { THROTTLER_LIMIT, THROTTLER_TTL } from "@nestjs/throttler/dist/throttler.constants";

import { AuthController, refreshErrorEndsSession } from "./auth.controller";

describe("AuthController refresh protection", () => {
  it("rate-limits the refresh endpoint per client", () => {
    const limit = Reflect.getMetadata(
      `${THROTTLER_LIMIT}default`,
      AuthController.prototype.refresh,
    );
    const ttl = Reflect.getMetadata(`${THROTTLER_TTL}default`, AuthController.prototype.refresh);
    expect(limit).toBe(30);
    expect(ttl).toBe(60_000);
  });

  it("clears the cookies only for a rejected session, never for a transient failure", () => {
    expect(refreshErrorEndsSession(401)).toBe(true);
    expect(refreshErrorEndsSession(403)).toBe(true);
    expect(refreshErrorEndsSession(429)).toBe(false);
    expect(refreshErrorEndsSession(500)).toBe(false);
    expect(refreshErrorEndsSession(503)).toBe(false);
  });
});
