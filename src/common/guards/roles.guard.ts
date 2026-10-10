import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { Role } from "../../generated/prisma/enums";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { AppException } from "../errors/app.exception";
import { ErrorCode } from "../errors/error-codes";
import type { AuthenticatedUser } from "../types/authenticated-user";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw AppException.unauthorized(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }
    if (!required.includes(user.role)) {
      throw AppException.forbidden(
        ErrorCode.FORBIDDEN_ROLE,
        "You do not have permission to perform this action",
      );
    }
    return true;
  }
}
