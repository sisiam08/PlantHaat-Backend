import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";

import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { verifyPassword } from "../../common/utils/password";
import { PrismaService } from "../../prisma/prisma.service";

const TTL_MS = 5 * 60 * 1000;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class SettingsReauthService {
  private tokens = new Map<string, { adminId: string; keys: string[]; expiresAt: number }>();
  private failures = new Map<string, { count: number; firstAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  private hash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async issue(adminId: string, password: string, keys: string[]) {
    const scope = [...new Set(keys)].sort();
    if (scope.length === 0) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Re-authentication scope is empty");
    }
    const failure = this.failures.get(adminId);
    if (failure && Date.now() - failure.firstAt < FAILURE_WINDOW_MS && failure.count >= MAX_FAILURES) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Too many re-auth attempts");
    }
    const user = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { passwordHash: true },
    });
    const valid = user ? await verifyPassword(user.passwordHash, password) : false;
    if (!valid) {
      const current =
        failure && Date.now() - failure.firstAt < FAILURE_WINDOW_MS
          ? { ...failure, count: failure.count + 1 }
          : { count: 1, firstAt: Date.now() };
      this.failures.set(adminId, current);
      throw AppException.badRequest(ErrorCode.INVALID_CREDENTIALS, "Incorrect password");
    }
    this.failures.delete(adminId);
    const token = randomBytes(24).toString("hex");
    this.tokens.set(this.hash(token), { adminId, keys: scope, expiresAt: Date.now() + TTL_MS });
    return { token, expiresAt: new Date(Date.now() + TTL_MS).toISOString() };
  }

  assert(token: string | undefined, adminId: string, keys: string[]): void {
    const scope = [...new Set(keys)].sort();
    if (!token) throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Re-authentication required");
    const hash = this.hash(token);
    const record = this.tokens.get(hash);
    if (!record || record.expiresAt < Date.now()) {
      this.tokens.delete(hash);
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Re-authentication expired");
    }
    if (
      record.adminId !== adminId ||
      record.keys.length !== scope.length ||
      record.keys.some((key, index) => key !== scope[index])
    ) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Re-authentication token does not match this setting");
    }
    this.tokens.delete(hash);
  }
}
