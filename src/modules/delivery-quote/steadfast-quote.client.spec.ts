import { jest } from "@jest/globals";

import type { AppConfigService } from "../../config/app-config.service";
import { Prisma } from "../../generated/prisma/client";
import {
  SteadfastCircuitOpenError,
  SteadfastQuoteClient,
  SteadfastRateLimitedError,
  SteadfastRequestError,
} from "./steadfast-quote.client";

const dec = (value: number) => new Prisma.Decimal(value);

function client(): SteadfastQuoteClient {
  return new SteadfastQuoteClient({
    values: { MAIL_FROM: "PlantHaat <support@example.test>" },
  } as AppConfigService);
}

function response(options: {
  status?: number;
  ok?: boolean;
  body?: unknown;
  retryAfter?: string | null;
}): Response {
  return {
    status: options.status ?? 200,
    ok: options.ok ?? true,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "retry-after" ? (options.retryAfter ?? null) : null,
    },
    json: async () => options.body,
  } as unknown as Response;
}

describe("SteadfastQuoteClient", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses options.home when it differs from charge", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      response({
        body: {
          charge: 70,
          available: true,
          lane: "inside_dhaka",
          options: { home: 65 },
        },
      }),
    );
    const quote = await client().fetch(1, 1, dec(0.5));
    expect(quote.charge?.toString()).toBe("65");
    expect(quote.available).toBe(true);
  });

  it("rejects with a rate-limit error and records Retry-After", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      response({ status: 429, ok: false, retryAfter: "2" }),
    );
    const service = client();
    await expect(service.fetch(1, 1, dec(0.5))).rejects.toBeInstanceOf(
      SteadfastRateLimitedError,
    );
    const health = service.health(true);
    expect(health.cooldownUntil).not.toBeNull();
    expect(health.lastError).toContain("429");
  });

  it("records a 5xx failure", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      response({ status: 503, ok: false }),
    );
    const service = client();
    await expect(service.fetch(1, 2, dec(0.5))).rejects.toBeInstanceOf(
      SteadfastRequestError,
    );
    expect(service.health(true).consecutiveFailures).toBe(1);
  });

  it("rejects invalid JSON", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => {
        throw new Error("bad json");
      },
    } as unknown as Response);
    const service = client();
    await expect(service.fetch(1, 2, dec(0.5))).rejects.toBeInstanceOf(
      SteadfastRequestError,
    );
    expect(service.health(true).lastError).toContain("invalid JSON");
  });

  it("treats an aborted request as a timeout", async () => {
    jest.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    const service = client();
    await expect(service.fetch(1, 2, dec(0.5))).rejects.toBeInstanceOf(
      SteadfastRequestError,
    );
    expect(service.health(true).lastError).toBe("timeout");
  });

  it("opens the circuit after five consecutive failures", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      response({ status: 500, ok: false }),
    );
    const service = client();
    for (let index = 0; index < 5; index += 1) {
      await expect(service.fetch(1, 2, dec(0.5))).rejects.toBeInstanceOf(
        SteadfastRequestError,
      );
    }
    const health = service.health(true);
    expect(health.circuitState).toBe("OPEN");
    await expect(service.fetch(1, 2, dec(0.5))).rejects.toBeInstanceOf(
      SteadfastCircuitOpenError,
    );
  }, 20_000);
});
