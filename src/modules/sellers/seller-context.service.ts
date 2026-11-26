import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { SellerStatus } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";

export interface SellerContext {
  sellerProfileId: string;
  userId: string;
  status: SellerStatus;
  businessName: string;
  shopId: string | null;
  shopStatus: string | null;
}

@Injectable()
export class SellerContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    return this.prisma.sellerProfile.findUnique({
      where: { userId },
      include: {
        shops: {
          orderBy: { createdAt: "asc" },
          include: {
            pickupThana: {
              select: { id: true, name: true, nameBn: true, dhakaZone: true },
            },
            pickupDistrict: { select: { id: true, name: true } },
          },
        },
        documents: { orderBy: { createdAt: "asc" } },
      },
    });
  }

  async requireProfile(userId: string) {
    const profile = await this.getProfile(userId);
    if (!profile) {
      throw AppException.forbidden(
        ErrorCode.SELLER_PROFILE_MISSING,
        "You do not have a seller profile",
      );
    }
    return profile;
  }

  async requireShop(userId: string) {
    const profile = await this.requireProfile(userId);
    const shop = profile.shops[0];
    if (!shop) {
      throw AppException.badRequest(
        ErrorCode.SELLER_APPLICATION_INCOMPLETE,
        "Create your shop before continuing",
      );
    }
    return { profile, shop };
  }

  toContext(profile: {
    id: string;
    userId: string;
    status: SellerStatus;
    businessName: string;
    shops: { id: string; status: string }[];
  }): SellerContext {
    return {
      sellerProfileId: profile.id,
      userId: profile.userId,
      status: profile.status,
      businessName: profile.businessName,
      shopId: profile.shops[0]?.id ?? null,
      shopStatus: profile.shops[0]?.status ?? null,
    };
  }
}

