import { THROTTLER_LIMIT, THROTTLER_TTL } from "@nestjs/throttler/dist/throttler.constants";

import { AuthController } from "./auth.controller";

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
});
