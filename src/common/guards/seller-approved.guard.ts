import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service";
import { AppException } from "../errors/app.exception";
import { ErrorCode } from "../errors/error-codes";
import type { AuthenticatedUser } from "../types/authenticated-user";

@Injectable()
export class SellerApprovedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw AppException.unauthorized(ErrorCode.UNAUTHENTICATED, "Authentication required");
    }
    if (user.role === "ADMIN") {
      return true;
    }
    if (user.role !== "SELLER") {
      throw AppException.forbidden(ErrorCode.FORBIDDEN_ROLE, "Seller access only");
    }

    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId: user.id },
      select: {
        status: true,
        shops: { select: { status: true }, take: 1, orderBy: { createdAt: "asc" } },
      },
    });
    if (!profile) {
      throw AppException.forbidden(
        ErrorCode.SELLER_PROFILE_MISSING,
        "You do not have a seller profile",
      );
    }
    if (profile.status !== "APPROVED") {
      throw AppException.forbidden(
        ErrorCode.SELLER_NOT_APPROVED,
        "Your seller account is not approved yet",
      );
    }
    const shop = profile.shops[0];
    if (!shop || shop.status !== "ACTIVE") {
      throw AppException.forbidden(ErrorCode.SHOP_UNAVAILABLE, "Your shop is not active");
    }
    return true;
  }
}
