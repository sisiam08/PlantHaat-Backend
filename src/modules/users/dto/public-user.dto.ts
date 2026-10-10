import { ApiProperty } from "@nestjs/swagger";

import { Role, SellerStatus, UserStatus } from "../../../generated/prisma/enums";

export class PublicUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty({ enum: Object.values(Role) }) role!: Role;
  @ApiProperty({ enum: Object.values(UserStatus) }) status!: UserStatus;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) emailVerifiedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) phoneVerifiedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: Object, description: "Per-user notification preferences" })
  notificationPrefs!: Record<string, unknown>;
  @ApiProperty({ enum: Object.values(SellerStatus), nullable: true })
  sellerStatus!: SellerStatus | null;
  @ApiProperty({ nullable: true, type: String }) shopId!: string | null;
}

export class AuthSessionResponseDto {
  @ApiProperty({ type: PublicUserDto }) user!: PublicUserDto;
  @ApiProperty({ example: 1750000000000, description: "Access token expiry (epoch ms)" })
  accessTokenExpiresAt!: number;
}
