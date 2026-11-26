import { Injectable, Logger } from "@nestjs/common";

import { Prisma } from "../../generated/prisma/client";
import { AppConfigService } from "../../config/app-config.service";

export interface SteadfastQuote {
  charge: Prisma.Decimal | null;
  available: boolean;
  lane: string | null;
  base: Prisma.Decimal | null;
  weightExtra: Prisma.Decimal;
}

export interface SteadfastHealth {
  liveEnabled: boolean;
  circuitState: "CLOSED" | "OPEN";
  circuitOpenUntil: string | null;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  requestsToday: number;
  cooldownUntil: string | null;
}

export class SteadfastCircuitOpenError extends Error {
  constructor() {
    super("Steadfast quote circuit is open");
    this.name = "SteadfastCircuitOpenError";
  }
}

export class SteadfastRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Steadfast quote is rate limited");
    this.name = "SteadfastRateLimitedError";
  }
}

export class SteadfastRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SteadfastRequestError";
  }
}

const QUOTE_URL = "https://steadfast.com.bd/pricing/quote";
const TIMEOUT_MS = 3_000;
const MIN_INTERVAL_MS = 1_000;
const FAILURE_THRESHOLD = 5;
const OPEN_MS = 5 * 60_000;

function supportEmail(mailFrom: string): string {
  const match = /<([^>]+)>/.exec(mailFrom);
  return (match?.[1] ?? mailFrom).trim();
}

function decimalOrNull(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? new Prisma.Decimal(number) : null;
}

@Injectable()
export class SteadfastQuoteClient {
  private readonly logger = new Logger(SteadfastQuoteClient.name);
  private readonly userAgent: string;
  private chain: Promise<void> = Promise.resolve();
  private nextAllowedAt = 0;
  private cooldownUntil = 0;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private lastSuccessAt: Date | null = null;
  private lastErrorAt: Date | null = null;
  private lastError: string | null = null;
  private requestsToday = 0;
  private requestsDay = new Date().toISOString().slice(0, 10);

  constructor(config: AppConfigService) {
    this.userAgent = `PlantHaat/1.0 (+${supportEmail(config.values.MAIL_FROM)})`;
  }

  async fetch(from: number, to: number, weightKg: Prisma.Decimal): Promise<SteadfastQuote> {
    return this.schedule(() => this.doFetch(from, to, weightKg));
  }

  health(liveEnabled: boolean): SteadfastHealth {
    return {
      liveEnabled,
      circuitState: Date.now() < this.circuitOpenUntil ? "OPEN" : "CLOSED",
      circuitOpenUntil:
        this.circuitOpenUntil > Date.now()
          ? new Date(this.circuitOpenUntil).toISOString()
          : null,
      consecutiveFailures: this.consecutiveFailures,
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
      lastErrorAt: this.lastErrorAt?.toISOString() ?? null,
      lastError: this.lastError,
      requestsToday: this.requestsToday,
      cooldownUntil:
        this.cooldownUntil > Date.now()
          ? new Date(this.cooldownUntil).toISOString()
          : null,
    };
  }

  private async schedule<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      if (Date.now() < this.circuitOpenUntil) {
        throw new SteadfastCircuitOpenError();
      }
      if (Date.now() < this.cooldownUntil) {
        throw new SteadfastRateLimitedError(
          Math.max(1, Math.ceil((this.cooldownUntil - Date.now()) / 1000)),
        );
      }
      const wait = this.nextAllowedAt - Date.now();
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      this.nextAllowedAt = Date.now() + MIN_INTERVAL_MS;
      return task();
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async doFetch(
    from: number,
    to: number,
    weightKg: Prisma.Decimal,
  ): Promise<SteadfastQuote> {
    this.rollDay();
    this.requestsToday += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const url =
      `${QUOTE_URL}?from=${from}&to=${to}&category=1` +
      `&weight=${encodeURIComponent(weightKg.toString())}` +
      "&service=1&delivery=0&cod=0";
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": this.userAgent,
        },
        signal: controller.signal,
      });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60;
        this.cooldownUntil = Date.now() + seconds * 1000;
        this.recordFailure(`HTTP 429 (retry after ${seconds}s)`);
        throw new SteadfastRateLimitedError(seconds);
      }
      if (!response.ok) {
        this.recordFailure(`HTTP ${response.status}`);
        throw new SteadfastRequestError(`Steadfast quote returned HTTP ${response.status}`);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        this.recordFailure("invalid JSON");
        throw new SteadfastRequestError("Steadfast quote returned invalid JSON");
      }
      const quote = this.parse(payload);
      this.consecutiveFailures = 0;
      this.lastSuccessAt = new Date();
      return quote;
    } catch (error) {
      if (
        error instanceof SteadfastRateLimitedError ||
        error instanceof SteadfastRequestError
      ) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        this.recordFailure("timeout");
        throw new SteadfastRequestError("Steadfast quote timed out");
      }
      this.recordFailure(error instanceof Error ? error.message : "unknown error");
      throw new SteadfastRequestError("Steadfast quote request failed");
    } finally {
      clearTimeout(timer);
    }
  }

  private parse(payload: unknown): SteadfastQuote {
    if (typeof payload !== "object" || payload === null) {
      throw new SteadfastRequestError("Steadfast quote returned an invalid body");
    }
    const body = payload as Record<string, unknown>;
    const home =
      typeof body.options === "object" && body.options !== null
        ? (body.options as Record<string, unknown>).home
        : undefined;
    const rawCharge = body.charge;
    const rawHome = home;
    if (
      rawCharge !== null &&
      rawCharge !== undefined &&
      rawHome !== null &&
      rawHome !== undefined &&
      Number(rawCharge) !== Number(rawHome)
    ) {
      this.logger.warn(
        `Steadfast quote charge (${Number(rawCharge)}) differs from options.home (${Number(rawHome)}); using options.home`,
      );
    }
    const charge = decimalOrNull(rawHome ?? rawCharge);
    const available = body.available !== false && charge !== null && charge.gte(0);
    return {
      charge: available ? charge : null,
      available,
      lane: typeof body.lane === "string" ? body.lane : null,
      base: decimalOrNull(body.base),
      weightExtra: decimalOrNull(body.weight_extra) ?? new Prisma.Decimal(0),
    };
  }

  private recordFailure(message: string): void {
    this.consecutiveFailures += 1;
    this.lastErrorAt = new Date();
    this.lastError = message.slice(0, 300);
    if (this.consecutiveFailures >= FAILURE_THRESHOLD) {
      this.circuitOpenUntil = Date.now() + OPEN_MS;
    }
    this.logger.debug(`Steadfast quote failure: ${this.lastError}`);
  }

  private rollDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.requestsDay) {
      this.requestsDay = today;
      this.requestsToday = 0;
    }
  }
}
