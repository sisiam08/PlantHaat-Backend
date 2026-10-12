import { ApiProperty } from "@nestjs/swagger";

export class EmailVerifiedDto {
  @ApiProperty({ example: true }) verified!: boolean;
}

export class VerificationResentDto {
  @ApiProperty() sent!: boolean;
  @ApiProperty()
  alreadyVerified!: boolean;
}

export class PasswordResetSentDto {
  @ApiProperty({ example: true, description: "Always true to avoid account enumeration" })
  sent!: boolean;
}

export class PasswordResetDoneDto {
  @ApiProperty({ example: true }) reset!: boolean;
}

export class PasswordChangedDoneDto {
  @ApiProperty({ example: true }) changed!: boolean;
}

export class AuthSessionListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) userAgent!: string | null;
  @ApiProperty({ nullable: true, type: String }) ipAddress!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) lastUsedAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ description: "Whether this list entry is the session making the request" })
  isCurrent!: boolean;
}
