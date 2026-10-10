import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";

import type { Request, RequestHandler } from "express";

import { safeEqual } from "../utils/crypto";

export function firstValidForwardedIp(value: string | string[] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const raw = Array.isArray(value) ? value.join(",") : value;
  for (const part of raw.split(",")) {
    const candidate = part.trim();
    if (candidate.length > 0 && isIP(candidate) !== 0) {
      return candidate;
    }
  }
  return undefined;
}

export interface ClientIpInput {
  headers: IncomingHttpHeaders;
  fallback?: string;
  secret?: string;
}

/**
 * When a shared BFF secret is configured AND the request carries the matching
 * `X-BFF-Key`, the real client IP is taken from the first valid IP in
 * `X-Forwarded-For`. Otherwise the socket remote address is used and forwarded
 * headers are ignored entirely (prevents spoofing by direct callers).
 */
export function resolveClientIp({ headers, fallback, secret }: ClientIpInput): string {
  if (secret) {
    const provided = headers["x-bff-key"];
    const key = Array.isArray(provided) ? provided[0] : provided;
    if (key && safeEqual(key, secret)) {
      const forwarded = firstValidForwardedIp(headers["x-forwarded-for"]);
      if (forwarded) {
        return forwarded;
      }
    }
  }
  return fallback && fallback.length > 0 ? fallback : "unknown";
}

export function createClientIpMiddleware(secret: string | undefined): RequestHandler {
  return (request, _response, next) => {
    const req = request as Request & { clientIp?: string };
    req.clientIp = resolveClientIp({
      headers: request.headers,
      fallback: request.socket.remoteAddress,
      secret,
    });
    next();
  };
}
