import { type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";

import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { AppException } from "../errors/app.exception";
import { ErrorCode } from "../errors/error-codes";
import type { AuthenticatedUser } from "../types/authenticated-user";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  override handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false,
    info: unknown,
  ): TUser {
    if (err) {
      if (err instanceof Error) {
        throw err;
      }
      throw AppException.unauthorized(ErrorCode.UNAUTHENTICATED, "Authentication failed");
    }
    if (!user) {
      if (info instanceof Error && info.name === "TokenExpiredError") {
        throw AppException.unauthorized(ErrorCode.TOKEN_EXPIRED, "Access token expired");
      }
      throw AppException.unauthorized(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }
    return user;
  }
}
