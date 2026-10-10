import type { Role, SellerStatus, UserStatus } from "../../generated/prisma/enums";

export interface PublicUserSource {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  createdAt: Date;
  notificationPrefs: unknown;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  createdAt: Date;
  notificationPrefs: unknown;
  sellerStatus: SellerStatus | null;
  shopId: string | null;
}

export function toPublicUser(
  user: PublicUserSource,
  sellerStatus: SellerStatus | null = null,
  shopId: string | null = null,
): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    phoneVerifiedAt: user.phoneVerifiedAt,
    createdAt: user.createdAt,
    notificationPrefs: user.notificationPrefs,
    sellerStatus,
    shopId,
  };
}
