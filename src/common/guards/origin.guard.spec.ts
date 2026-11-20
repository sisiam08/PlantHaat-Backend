import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AppConfigService } from "../../config/app-config.service";
import { OriginGuard } from "./origin.guard";

const SECRET = "bff-secret-value-for-the-test";

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function guard(bffSecret = SECRET): OriginGuard {
  const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
  const config = {
    values: { CORS_ORIGINS: ["http://localhost:3002"], BFF_SHARED_SECRET: bffSecret },
  } as unknown as AppConfigService;
  return new OriginGuard(reflector, config);
}

describe("OriginGuard", () => {
  it("allows an allowed browser origin", () => {
    expect(
      guard().canActivate(context({ method: "POST", headers: { origin: "http://localhost:3002" } })),
    ).toBe(true);
  });

  it("rejects a foreign origin", () => {
    expect(() =>
      guard().canActivate(context({ method: "POST", headers: { origin: "https://evil.example" } })),
    ).toThrow();
  });

  it("lets a BFF request through so auth produces 401, not a CSRF 403", () => {
    expect(
      guard().canActivate(context({ method: "POST", headers: { "x-bff-key": SECRET } })),
    ).toBe(true);
  });

  it("rejects a wrong BFF key without an origin or bearer", () => {
    expect(() =>
      guard().canActivate(context({ method: "POST", headers: { "x-bff-key": `${SECRET}x` } })),
    ).toThrow();
  });

  it("still rejects a direct mutation without origin, bearer or key", () => {
    expect(() => guard().canActivate(context({ method: "POST", headers: {} }))).toThrow();
  });
});
