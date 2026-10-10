import type { Request } from "express";

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export function getRequestMeta(request: Request): RequestMeta {
  const userAgent = request.headers["user-agent"];
  const forwarded = request.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return {
    ipAddress: forwardedValue?.split(",")[0]?.trim() || request.ip,
    userAgent: typeof userAgent === "string" ? userAgent : undefined,
  };
}
