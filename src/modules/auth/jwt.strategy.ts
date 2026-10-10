import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AppConfigService } from "../../config/app-config.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ACCESS_COOKIE } from "./auth.cookies";
import type { AccessTokenPayload } from "./jwt.types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: { cookies?: Record<string, string> }) => request.cookies?.[ACCESS_COOKIE] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: config.values.JWT_ACCESS_SECRET,
      issuer: config.values.JWT_ISSUER,
      audience: config.values.JWT_AUDIENCE,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true, email: true, deletedAt: true },
    });
    if (!user || user.deletedAt) {
      throw AppException.unauthorized(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }
    if (user.status !== "ACTIVE") {
      throw AppException.forbidden(ErrorCode.ACCOUNT_SUSPENDED, "Account is suspended");
    }
    return { id: user.id, role: user.role, email: user.email, sessionId: payload.sid };
  }
}
