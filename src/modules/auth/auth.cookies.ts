import type { CookieOptions, Request, Response } from "express";

import type { AppConfigService } from "../../config/app-config.service";

export const ACCESS_COOKIE = "ph_at";
export const REFRESH_COOKIE = "ph_rt";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

export interface AuthTokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
}

function baseCookieOptions(config: AppConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    ...(config.values.COOKIE_DOMAIN ? { domain: config.values.COOKIE_DOMAIN } : {}),
  };
}

export function setAccessCookie(
  res: Response,
  config: AppConfigService,
  accessToken: string,
): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookieOptions(config),
    path: "/",
    maxAge: config.values.JWT_ACCESS_TTL * 1000,
  });
}

export function setRefreshCookie(
  res: Response,
  config: AppConfigService,
  refreshToken: string,
): void {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions(config),
    path: REFRESH_COOKIE_PATH,
    maxAge: config.values.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function setAuthCookies(
  res: Response,
  config: AppConfigService,
  tokens: AuthTokenPair,
): void {
  setAccessCookie(res, config, tokens.accessToken);
  setRefreshCookie(res, config, tokens.refreshToken);
}

export function clearAuthCookies(res: Response, config: AppConfigService): void {
  const options = baseCookieOptions(config);
  res.clearCookie(ACCESS_COOKIE, { ...options, path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...options, path: REFRESH_COOKIE_PATH });
}

export function readRefreshCookie(request: Request): string | undefined {
  const cookies = (request as unknown as { cookies?: Record<string, string> }).cookies;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === "string" ? value : undefined;
}
