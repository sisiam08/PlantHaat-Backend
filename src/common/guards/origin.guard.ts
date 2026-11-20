import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { AppConfigService } from "../../config/app-config.service";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { AppException } from "../errors/app.exception";
import { ErrorCode } from "../errors/error-codes";
import { safeEqual } from "../utils/crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const origin = resolveOrigin(request);
    if (origin) {
      if (this.config.values.CORS_ORIGINS.includes(origin)) {
        return true;
      }
      throw AppException.forbidden(ErrorCode.ORIGIN_NOT_ALLOWED, "Origin not allowed");
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const hasBearer =
      typeof request.headers.authorization === "string" &&
      request.headers.authorization.startsWith("Bearer ");

    // Server-to-server calls from the Next BFF carry the shared secret and no
    // browser Origin. They still need to reach the JWT guard so an expired or
    // missing token is a 401 (refresh/dialog), not a misleading CSRF 403.
    const bffSecret = this.config.values.BFF_SHARED_SECRET;
    const providedKey = request.headers["x-bff-key"];
    const bffKey = Array.isArray(providedKey) ? providedKey[0] : providedKey;
    if (bffSecret && typeof bffKey === "string" && safeEqual(bffKey, bffSecret)) {
      return true;
    }

    if (isPublic || hasBearer) {
      return true;
    }

    throw AppException.forbidden(ErrorCode.ORIGIN_NOT_ALLOWED, "Origin not allowed");
  }
}

function resolveOrigin(request: Request): string | undefined {
  const origin = request.headers.origin;
  if (typeof origin === "string" && origin.length > 0) {
    return origin;
  }
  const referer = request.headers.referer;
  if (typeof referer === "string" && referer.length > 0) {
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
