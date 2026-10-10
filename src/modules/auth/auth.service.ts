import { randomUUID } from "node:crypto";

import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { JwtService } from "@nestjs/jwt";
import { Cron, CronExpression } from "@nestjs/schedule";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { randomToken, safeEqualHex, sha256Hex } from "../../common/utils/crypto";
import { hashPassword, verifyPassword } from "../../common/utils/password";
import { normalizeBdPhone } from "../../common/utils/phone";
import { AppConfigService } from "../../config/app-config.service";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import type { AuthTokenType, Role } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { buildPasswordResetEmail, buildVerificationEmail } from "../mail/mail.templates";
import { toPublicUser, type PublicUser } from "../users/user.mapper";
import type { AuthTokenPair } from "./auth.cookies";
import type { ChangePasswordDto } from "./dto/change-password.dto";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterSellerDto } from "./dto/register-seller.dto";
import type { RegisterDto } from "./dto/register.dto";

const MAX_ACTIVE_SESSIONS = 10;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60;
const PASSWORD_RESET_TTL_SECONDS = 60 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

const PUBLIC_USER_SELECT = {
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
} satisfies Prisma.UserSelect;

export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthTokens extends AuthTokenPair {
  sessionId: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export interface RefreshResult {
  user: PublicUser;
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken?: string;
}

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: Date;
  createdAt: Date;
  isCurrent: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly events: EventEmitter2,
  ) {}

  async register(dto: RegisterDto, meta: SessionMeta): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    await this.ensureEmailAvailable(email);
    const phone = this.normalizePhone(dto.phone);
    if (phone) {
      await this.ensurePhoneAvailable(phone);
    }
    const passwordHash = await hashPassword(dto.password);

    const { user, token } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, name: dto.name.trim(), passwordHash, phone, role: "CUSTOMER" },
        select: PUBLIC_USER_SELECT,
      });
      const verificationToken = await this.issueAuthToken(
        tx,
        created.id,
        "EMAIL_VERIFICATION",
        EMAIL_VERIFICATION_TTL_SECONDS,
      );
      return { user: created, token: verificationToken };
    });

    this.sendVerificationEmail(user.email, user.name, token);
    const tokens = await this.createAuthTokens({ userId: user.id, role: user.role, meta });
    return { user: toPublicUser(user), tokens };
  }

  async registerSeller(dto: RegisterSellerDto, meta: SessionMeta): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    await this.ensureEmailAvailable(email);
    const phone = this.normalizePhone(dto.phone);
    if (phone) {
      await this.ensurePhoneAvailable(phone);
    }
    const contactPhone = this.normalizePhone(dto.contactPhone)!;
    const passwordHash = await hashPassword(dto.password);

    const { user, token } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name: dto.name.trim(),
          passwordHash,
          phone,
          role: "SELLER",
          sellerProfile: {
            create: {
              businessName: dto.businessName.trim(),
              contactPhone,
              sellerType: dto.sellerType ?? "NURSERY",
              businessAddress: dto.businessAddress?.trim() ?? "",
            },
          },
        },
        select: PUBLIC_USER_SELECT,
      });
      const verificationToken = await this.issueAuthToken(
        tx,
        created.id,
        "EMAIL_VERIFICATION",
        EMAIL_VERIFICATION_TTL_SECONDS,
      );
      return { user: created, token: verificationToken };
    });

    this.sendVerificationEmail(user.email, user.name, token);
    const tokens = await this.createAuthTokens({ userId: user.id, role: user.role, meta });
    return { user: toPublicUser(user), tokens };
  }

  async login(dto: LoginDto, meta: SessionMeta): Promise<AuthResult> {
    const email = dto.email.trim().toLowerCase();
    const genericError = AppException.unauthorized(
      ErrorCode.INVALID_CREDENTIALS,
      "Invalid email or password",
    );

    const user = await this.prisma.user.findFirst({ where: { email, deletedAt: null } });
    if (!user) {
      throw genericError;
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      throw AppException.locked(
        ErrorCode.ACCOUNT_LOCKED,
        "Account is temporarily locked due to too many failed attempts",
      );
    }

    const passwordValid = await verifyPassword(user.passwordHash, dto.password);
    if (!passwordValid) {
      const failedLoginCount = user.failedLoginCount + 1;
      const shouldLock = failedLoginCount >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount,
          ...(shouldLock ? { lockedUntil: addMinutes(now, LOCK_MINUTES) } : {}),
        },
      });
      if (shouldLock) {
        throw AppException.locked(
          ErrorCode.ACCOUNT_LOCKED,
          "Account is temporarily locked due to too many failed attempts",
        );
      }
      throw genericError;
    }

    if (user.status !== "ACTIVE") {
      throw AppException.forbidden(ErrorCode.ACCOUNT_SUSPENDED, "Account is suspended");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    await this.enforceSessionLimit(user.id);

    const tokens = await this.createAuthTokens({ userId: user.id, role: user.role, meta });
    return { user: toPublicUser(user), tokens };
  }

  async refresh(rawRefreshToken: string | undefined, meta: SessionMeta): Promise<RefreshResult> {
    const parsed = parseRefreshToken(rawRefreshToken);
    if (!parsed) {
      throw AppException.unauthorized(ErrorCode.INVALID_REFRESH_TOKEN, "Invalid refresh token");
    }

    const session = await this.prisma.refreshSession.findUnique({
      where: { id: parsed.sessionId },
      include: { user: { select: { ...PUBLIC_USER_SELECT, deletedAt: true } } },
    });
    if (!session) {
      throw AppException.unauthorized(ErrorCode.INVALID_REFRESH_TOKEN, "Invalid refresh token");
    }

    if (!safeEqualHex(sha256Hex(parsed.secret), session.tokenHash)) {
      await this.revokeFamily(session.familyId, "TOKEN_MISMATCH");
      throw AppException.unauthorized(ErrorCode.INVALID_REFRESH_TOKEN, "Invalid refresh token");
    }

    const now = new Date();
    if (session.revokedAt || session.expiresAt < now) {
      throw AppException.unauthorized(ErrorCode.SESSION_EXPIRED, "Session has expired");
    }

    const user = session.user;
    if (user.deletedAt) {
      throw AppException.unauthorized(ErrorCode.INVALID_REFRESH_TOKEN, "Invalid refresh token");
    }
    if (user.status !== "ACTIVE") {
      await this.revokeSession(session.id, "ACCOUNT_SUSPENDED");
      throw AppException.forbidden(ErrorCode.ACCOUNT_SUSPENDED, "Account is suspended");
    }

    const rotation = await this.prisma.refreshSession.updateMany({
      where: { id: session.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: now, lastUsedAt: now },
    });

    if (rotation.count === 1) {
      const tokens = await this.createAuthTokens({
        userId: user.id,
        role: user.role,
        meta,
        familyId: session.familyId,
      });
      await this.prisma.refreshSession.update({
        where: { id: session.id },
        data: { replacedById: tokens.sessionId },
      });
      return {
        user: toPublicUser(user),
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
        refreshToken: tokens.refreshToken,
      };
    }

    const current = await this.prisma.refreshSession.findUnique({
      where: { id: session.id },
      select: { revokedAt: true, rotatedAt: true, replacedById: true },
    });

    if (current?.revokedAt) {
      throw AppException.unauthorized(ErrorCode.SESSION_EXPIRED, "Session has expired");
    }

    const rotatedAt = current?.rotatedAt ?? session.rotatedAt;
    const graceMs = this.config.values.REFRESH_REUSE_GRACE_SECONDS * 1000;
    if (rotatedAt && now.getTime() - rotatedAt.getTime() <= graceMs) {
      const sessionId = current?.replacedById ?? session.id;
      const accessToken = await this.signAccessToken(user.id, user.role, sessionId);
      return {
        user: toPublicUser(user),
        accessToken,
        accessTokenExpiresAt: this.accessTokenExpiresAt(),
      };
    }

    await this.revokeFamily(session.familyId, "REUSE_DETECTED");
    throw AppException.unauthorized(
      ErrorCode.REFRESH_TOKEN_REUSED,
      "Refresh token reuse detected; please sign in again",
    );
  }

  async logout(rawRefreshToken: string | undefined): Promise<void> {
    const parsed = parseRefreshToken(rawRefreshToken);
    if (!parsed) {
      return;
    }
    const session = await this.prisma.refreshSession.findUnique({
      where: { id: parsed.sessionId },
      select: { familyId: true, userId: true },
    });
    if (session) {
      await this.revokeFamily(session.familyId, "LOGOUT");
      this.events.emit("auth.session_revoked", {
        userId: session.userId,
        sid: parsed.sessionId,
      });
    }
  }

  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllSessions(userId, "LOGOUT_ALL");
    this.events.emit("auth.session_revoked", { userId });
  }

  async listSessions(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
    const sessions = await this.prisma.refreshSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === currentSessionId,
    }));
  }

  async revokeSessionForUser(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.refreshSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!session) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Session not found");
    }
    await this.revokeSession(sessionId, "REVOKED_BY_USER");
    this.events.emit("auth.session_revoked", { userId, sid: sessionId });
  }

  async verifyEmail(token: string): Promise<{ verified: true }> {
    const record = await this.findAuthToken(token, "EMAIL_VERIFICATION");
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.authToken.update({ where: { id: record.id }, data: { usedAt: now } }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: now },
      }),
    ]);
    return { verified: true };
  }

  async resendVerification(userId: string): Promise<{ sent: boolean; alreadyVerified: boolean }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, name: true, emailVerifiedAt: true },
    });
    if (!user) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "User not found");
    }
    if (user.emailVerifiedAt) {
      return { sent: false, alreadyVerified: true };
    }

    const lastToken = await this.prisma.authToken.findFirst({
      where: { userId, type: "EMAIL_VERIFICATION" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (lastToken && Date.now() - lastToken.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      throw new AppException({
        code: ErrorCode.TOO_MANY_REQUESTS,
        message: "Please wait before requesting another verification email",
        status: 429,
      });
    }

    const token = await this.issueAuthToken(
      this.prisma,
      user.id,
      "EMAIL_VERIFICATION",
      EMAIL_VERIFICATION_TTL_SECONDS,
    );
    this.sendVerificationEmail(user.email, user.name, token);
    return { sent: true, alreadyVerified: false };
  }

  async forgotPassword(email: string): Promise<{ sent: true }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: normalized, deletedAt: null },
      select: { id: true, email: true, name: true, status: true },
    });
    if (user && user.status === "ACTIVE") {
      const token = await this.issueAuthToken(
        this.prisma,
        user.id,
        "PASSWORD_RESET",
        PASSWORD_RESET_TTL_SECONDS,
      );
      const url = `${this.config.values.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
      this.mail.queue({ ...buildPasswordResetEmail({ name: user.name, url }), to: user.email });
    }
    return { sent: true };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ reset: true }> {
    const record = await this.findAuthToken(token, "PASSWORD_RESET");
    const now = new Date();
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction([
      this.prisma.authToken.update({ where: { id: record.id }, data: { usedAt: now } }),
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.refreshSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now, revokedReason: "PASSWORD_RESET" },
      }),
    ]);
    this.events.emit("auth.session_revoked", { userId: record.userId });
    return { reset: true };
  }

  async changePassword(
    userId: string,
    currentSessionId: string,
    dto: ChangePasswordDto,
  ): Promise<{ changed: true }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "User not found");
    }
    const valid = await verifyPassword(user.passwordHash, dto.currentPassword);
    if (!valid) {
      throw AppException.badRequest(ErrorCode.INVALID_CREDENTIALS, "Current password is incorrect");
    }
    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshSession.updateMany({
        where: { userId, id: { not: currentSessionId }, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "PASSWORD_CHANGED" },
      }),
    ]);
    this.events.emit("auth.session_revoked", { userId });
    return { changed: true };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpired(): Promise<void> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [sessions, tokens] = await this.prisma.$transaction([
      this.prisma.refreshSession.deleteMany({
        where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
      }),
      this.prisma.authToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
      }),
    ]);
    this.logger.log(
      `Cleanup removed ${sessions.count} refresh sessions and ${tokens.count} auth tokens`,
    );
  }

  private async createAuthTokens(params: {
    userId: string;
    role: Role;
    meta: SessionMeta;
    familyId?: string;
  }): Promise<AuthTokens> {
    const secret = randomToken(48);
    const session = await this.prisma.refreshSession.create({
      data: {
        userId: params.userId,
        familyId: params.familyId ?? randomUUID(),
        tokenHash: sha256Hex(secret),
        userAgent: params.meta.userAgent ?? null,
        ipAddress: params.meta.ipAddress ?? null,
        expiresAt: addDays(new Date(), this.config.values.REFRESH_TTL_DAYS),
      },
    });
    const accessToken = await this.signAccessToken(params.userId, params.role, session.id);
    return {
      accessToken,
      refreshToken: `${session.id}.${secret}`,
      sessionId: session.id,
      accessTokenExpiresAt: this.accessTokenExpiresAt(),
    };
  }

  private signAccessToken(userId: string, role: Role, sessionId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, role, sid: sessionId });
  }

  private accessTokenExpiresAt(): number {
    return Date.now() + this.config.values.JWT_ACCESS_TTL * 1000;
  }

  private async enforceSessionLimit(userId: string): Promise<void> {
    const active = await this.prisma.refreshSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const excess = active.length - (MAX_ACTIVE_SESSIONS - 1);
    if (excess <= 0) {
      return;
    }
    const idsToRevoke = active.slice(0, excess).map((session) => session.id);
    await this.prisma.refreshSession.updateMany({
      where: { id: { in: idsToRevoke } },
      data: { revokedAt: new Date(), revokedReason: "SESSION_LIMIT" },
    });
  }

  private async issueAuthToken(
    client: Prisma.TransactionClient | PrismaClient,
    userId: string,
    type: AuthTokenType,
    ttlSeconds: number,
  ): Promise<string> {
    const token = randomToken(32);
    await client.authToken.create({
      data: {
        userId,
        type,
        tokenHash: sha256Hex(token),
        expiresAt: addSeconds(new Date(), ttlSeconds),
      },
    });
    return token;
  }

  private async findAuthToken(token: string, type: AuthTokenType) {
    const record = await this.prisma.authToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
      throw AppException.badRequest(
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
        "This link is invalid or has expired",
      );
    }
    return record;
  }

  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async revokeAllSessions(userId: string, reason: string): Promise<void> {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async ensureEmailAvailable(email: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw AppException.conflict(
        ErrorCode.EMAIL_ALREADY_REGISTERED,
        "Email is already registered",
      );
    }
  }

  private async ensurePhoneAvailable(phone: string): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { phone },
      select: { id: true },
    });
    if (existing) {
      throw AppException.conflict(ErrorCode.CONFLICT, "Phone number is already in use");
    }
  }

  private normalizePhone(phone: string | undefined): string | null {
    if (!phone) {
      return null;
    }
    try {
      return normalizeBdPhone(phone);
    } catch {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Invalid phone number");
    }
  }

  private sendVerificationEmail(email: string, name: string, token: string): void {
    const url = `${this.config.values.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
    this.mail.queue({ ...buildVerificationEmail({ name, url }), to: email });
  }
}

function parseRefreshToken(
  raw: string | undefined,
): { sessionId: string; secret: string } | undefined {
  if (!raw) {
    return undefined;
  }
  const separatorIndex = raw.indexOf(".");
  if (separatorIndex <= 0 || separatorIndex === raw.length - 1) {
    return undefined;
  }
  return {
    sessionId: raw.slice(0, separatorIndex),
    secret: raw.slice(separatorIndex + 1),
  };
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}
