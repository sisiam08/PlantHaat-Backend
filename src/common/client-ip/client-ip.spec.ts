import { Reflector } from "@nestjs/core";
import type { ThrottlerModuleOptions, ThrottlerStorage } from "@nestjs/throttler";

import { AppThrottlerGuard } from "../guards/app-throttler.guard";
import type { AppConfigService } from "../../config/app-config.service";
import { firstValidForwardedIp, resolveClientIp } from "./client-ip";

describe("client-ip", () => {
  const secret = "s".repeat(40);

  it("takes the first valid forwarded IP", () => {
    expect(firstValidForwardedIp("203.0.113.5, 10.0.0.1")).toBe("203.0.113.5");
    expect(firstValidForwardedIp("garbage, 198.51.100.9")).toBe("198.51.100.9");
    expect(firstValidForwardedIp("not-an-ip")).toBeUndefined();
    expect(firstValidForwardedIp(undefined)).toBeUndefined();
    expect(firstValidForwardedIp(["2001:db8::1"])).toBe("2001:db8::1");
  });

  it("honors X-Forwarded-For only with the correct BFF key", () => {
    const headers = {
      "x-bff-key": secret,
      "x-forwarded-for": "203.0.113.5",
    };
    expect(resolveClientIp({ headers, fallback: "10.0.0.1", secret })).toBe("203.0.113.5");

    expect(
      resolveClientIp({
        headers: { "x-bff-key": "wrong", "x-forwarded-for": "203.0.113.5" },
        fallback: "10.0.0.1",
        secret,
      }),
    ).toBe("10.0.0.1");

    expect(
      resolveClientIp({
        headers: { "x-forwarded-for": "203.0.113.5" },
        fallback: "10.0.0.1",
        secret,
      }),
    ).toBe("10.0.0.1");
  });

  it("ignores forwarded headers when no secret is configured", () => {
    expect(
      resolveClientIp({
        headers: { "x-forwarded-for": "203.0.113.5" },
        fallback: "10.0.0.1",
      }),
    ).toBe("10.0.0.1");
  });
});

describe("AppThrottlerGuard.getTracker", () => {
  const config = {
    values: {},
    isTest: false,
    isProduction: false,
    isDevelopment: true,
  } as unknown as AppConfigService;

  it("uses the middleware-resolved client IP", async () => {
    const guard = new AppThrottlerGuard(
      {} as ThrottlerModuleOptions,
      {} as ThrottlerStorage,
      new Reflector(),
      config,
    );
    const tracker = (guard as unknown as {
      getTracker: (req: Record<string, unknown>) => Promise<string>;
    }).getTracker;
    await expect(tracker.call(guard, { clientIp: "203.0.113.5", ip: "10.0.0.1" })).resolves.toBe(
      "203.0.113.5",
    );
    await expect(tracker.call(guard, { ip: "10.0.0.1" })).resolves.toBe("10.0.0.1");
  });
});
