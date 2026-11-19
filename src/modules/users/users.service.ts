import { Injectable } from "@nestjs/common";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { normalizeBdPhone } from "../../common/utils/phone";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { UploadPurpose } from "../uploads/dto/upload-image.dto";
import { UploadsService } from "../uploads/uploads.service";
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
  notificationPrefs: true,
  sellerProfile: {
    select: {
      status: true,
      shops: { select: { id: true }, take: 1, orderBy: { createdAt: "asc" } },
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

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

    if (dto.notificationPrefs !== undefined) {
      const current = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { notificationPrefs: true },
      });
      data.notificationPrefs = mergeNotificationPrefs(
        current?.notificationPrefs,
        dto.notificationPrefs,
      ) as Prisma.InputJsonValue;
    }

    await this.prisma.user.update({ where: { id: userId }, data });
    return this.getProfile(userId);
  }

  async updateAvatar(userId: string, file: Express.Multer.File | undefined): Promise<PublicUser> {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });
    const stored = await this.uploads.uploadImage(file, UploadPurpose.AVATAR, userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { avatarUrl: stored.url },
      });
      await this.uploads.attachAssetsInTransaction(tx, [stored.url]);
    });
    if (current?.avatarUrl && current.avatarUrl !== stored.url) {
      await this.uploads.deleteByUrl(current.avatarUrl);
    }
    return this.getProfile(userId);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Shallow-merges top-level keys, deep-merging one nested object level. */
function mergeNotificationPrefs(
  base: unknown,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    const existing = result[key];
    result[key] = isPlainObject(existing) && isPlainObject(value) ? { ...existing, ...value } : value;
  }
  return result;
}
