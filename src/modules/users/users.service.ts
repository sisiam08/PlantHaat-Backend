import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { normalizeBdPhone } from "../../common/utils/phone";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { UpdateProfileDto } from "./dto/update-profile.dto";
import { toPublicUser, type PublicUser } from "./user.mapper";

const USER_PROFILE_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
  createdAt: true,
  sellerProfile: {
    select: {
      status: true,
      shops: { select: { id: true }, take: 1, orderBy: { createdAt: "asc" } },
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: USER_PROFILE_SELECT,
    });
    if (!user) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "User not found");
    }
    return toPublicUser(
      user,
      user.sellerProfile?.status ?? null,
      user.sellerProfile?.shops[0]?.id ?? null,
    );
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    const data: Prisma.UserUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.phone !== undefined) {
      const phone = normalizeBdPhone(dto.phone);
      const existing = await this.prisma.user.findFirst({
        where: { phone, id: { not: userId } },
        select: { id: true },
      });
      if (existing) {
        throw AppException.conflict(ErrorCode.CONFLICT, "Phone number is already in use");
      }
      data.phone = phone;
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getProfile(userId);
  }
}
