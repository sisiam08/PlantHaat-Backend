import type { Request } from "express";

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

export function getRequestMeta(request: Request): RequestMeta {
  const userAgent = request.headers["user-agent"];
  const clientIp = (request as Request & { clientIp?: string }).clientIp;
  return {
    ipAddress: clientIp ?? request.ip,
    userAgent: typeof userAgent === "string" ? userAgent : undefined,
  };
}
