import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import type { RequestMeta } from "../../common/utils/request-meta";
import { normalizeBdPhone } from "../../common/utils/phone";
import { Prisma } from "../../generated/prisma/client";
import type { CodRiskStatus } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SettingsService } from "../settings/settings.service";
import type {
  QueryCodRiskDto,
  SetCodRiskStatusDto,
  SetCodRiskWhitelistDto,
} from "./dto/cod-risk.dto";

const RANK: Record<CodRiskStatus, number> = {
  OK: 0,
  WATCH: 1,
  RESTRICTED: 2,
  BLOCKED: 3,
};

export interface CodRiskAssessment {
  status: CodRiskStatus;
  capExceeded: boolean;
}

@Injectable()
export class CodRiskService {
  private readonly logger = new Logger(CodRiskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  normalize(phone: string | null | undefined): string | null {
    if (!phone) return null;
    try {
      return normalizeBdPhone(phone);
    } catch {
      return null;
    }
  }

  /** Secondary signal only: a stable hash of the normalized delivery address. */
  fingerprint(address: {
    districtId: number;
    area: string;
    addressLine: string;
  }): string {
    const normalized = [
      address.districtId,
      address.area.trim().toLowerCase().replace(/\s+/g, " "),
      address.addressLine.trim().toLowerCase().replace(/\s+/g, " "),
    ].join("|");
    return createHash("sha256").update(normalized).digest("hex");
  }

  async assess(input: {
    shippingPhone: string | null;
    accountPhone: string | null;
    addressFingerprint: string | null;
    codTotal: Prisma.Decimal;
  }): Promise<CodRiskAssessment> {
    const phones = [this.normalize(input.shippingPhone), this.normalize(input.accountPhone)]
      .filter((phone): phone is string => Boolean(phone));
    const or: Prisma.PhoneRiskProfileWhereInput[] = [];
    if (phones.length > 0) or.push({ phoneNormalized: { in: phones } });
    if (input.addressFingerprint) or.push({ addressFingerprint: input.addressFingerprint });
    if (or.length === 0) return { status: "OK", capExceeded: false };

    const profiles = await this.prisma.phoneRiskProfile.findMany({ where: { OR: or } });
    const shipping = phones[0]
      ? profiles.find((profile) => profile.phoneNormalized === phones[0])
      : undefined;
    if (shipping?.isWhitelisted) {
      return { status: "OK", capExceeded: false };
    }

    let status: CodRiskStatus = "OK";
    for (const profile of profiles) {
      if (profile.isWhitelisted) continue;
      if (RANK[profile.status] > RANK[status]) {
        status = profile.status;
      }
    }
    const cap = await this.settings.getNumber("codRisk.restrictCap");
    return {
      status,
      capExceeded:
        status === "RESTRICTED" && input.codTotal.gt(new Prisma.Decimal(cap)),
    };
  }

  async recordFailure(
    phone: string | null | undefined,
    addressFingerprint: string | null,
  ): Promise<void> {
    const phoneNormalized = this.normalize(phone);
    if (!phoneNormalized) return;
    try {
      const [watchAfter, blockAfter, windowDays] = await Promise.all([
        this.settings.getNumber("codRisk.watchAfter"),
        this.settings.getNumber("codRisk.blockAfter"),
        this.settings.getNumber("codRisk.windowDays"),
      ]);
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowDays * 86_400_000);
      const existing = await this.prisma.phoneRiskProfile.findUnique({
        where: { phoneNormalized },
      });
      const inWindow =
        existing?.lastEventAt !== null &&
        existing?.lastEventAt !== undefined &&
        existing.lastEventAt >= windowStart;
      const failedCount = inWindow ? (existing?.failedCount ?? 0) + 1 : 1;

      let status: CodRiskStatus = existing?.status ?? "OK";
      if (existing?.isWhitelisted) {
        status = "OK";
      } else if (failedCount >= blockAfter) {
        status = "BLOCKED";
      } else if (failedCount >= watchAfter) {
        status = "WATCH";
      }
      // Preserve an admin-set RESTRICTED until the automatic BLOCKED level.
      if (
        existing?.status === "RESTRICTED" &&
        !existing.isWhitelisted &&
        status !== "BLOCKED"
      ) {
        status = "RESTRICTED";
      }

      await this.prisma.phoneRiskProfile.upsert({
        where: { phoneNormalized },
        update: {
          failedCount,
          lastEventAt: now,
          status,
          ...(addressFingerprint ? { addressFingerprint } : {}),
        },
        create: {
          phoneNormalized,
          failedCount,
          lastEventAt: now,
          status,
          addressFingerprint,
        },
      });

      if (status !== (existing?.status ?? "OK") && status !== "OK") {
        await this.notifications.createForAdmins({
          type: "COD_RISK_FLAG",
          title: "COD risk level changed",
          body: `${phoneNormalized} is now ${status} after ${failedCount} failed deliveries.`,
          data: { phoneNormalized, status, failedCount },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to record COD failure: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  async recordDelivery(
    phone: string | null | undefined,
    addressFingerprint: string | null,
  ): Promise<void> {
    const phoneNormalized = this.normalize(phone);
    if (!phoneNormalized) return;
    try {
      const now = new Date();
      await this.prisma.phoneRiskProfile.upsert({
        where: { phoneNormalized },
        update: {
          deliveredCount: { increment: 1 },
          lastEventAt: now,
          ...(addressFingerprint ? { addressFingerprint } : {}),
        },
        create: {
          phoneNormalized,
          deliveredCount: 1,
          lastEventAt: now,
          addressFingerprint,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record COD delivery: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  /** Badge data for seller/admin order views: status only, never the history. */
  async riskByPhones(phones: (string | null | undefined)[]): Promise<Map<string, CodRiskStatus>> {
    const normalized = [
      ...new Set(phones.map((phone) => this.normalize(phone)).filter(Boolean)),
    ] as string[];
    if (normalized.length === 0) return new Map();
    const profiles = await this.prisma.phoneRiskProfile.findMany({
      where: { phoneNormalized: { in: normalized } },
      select: { phoneNormalized: true, status: true, isWhitelisted: true },
    });
    return new Map(
      profiles.map((profile) => [
        profile.phoneNormalized,
        profile.isWhitelisted ? ("OK" as CodRiskStatus) : profile.status,
      ]),
    );
  }

  async list(query: QueryCodRiskDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.PhoneRiskProfileWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { phoneNormalized: { contains: query.q.trim() } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.phoneRiskProfile.findMany({
        where,
        orderBy: [{ lastEventAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      this.prisma.phoneRiskProfile.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async get(id: string) {
    const profile = await this.prisma.phoneRiskProfile.findUnique({ where: { id } });
    if (!profile) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Risk profile not found");
    }
    return profile;
  }

  async setStatus(
    id: string,
    dto: SetCodRiskStatusDto,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ) {
    const before = await this.get(id);
    const updated = await this.prisma.phoneRiskProfile.update({
      where: { id },
      data: { status: dto.status, note: dto.note ?? before.note, setById: actor.id },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "codRisk.status",
      entityType: "PhoneRiskProfile",
      entityId: id,
      before: { status: before.status, note: before.note },
      after: { status: dto.status, note: dto.note ?? before.note },
      ...meta,
    });
    return updated;
  }

  async setWhitelist(
    id: string,
    dto: SetCodRiskWhitelistDto,
    actor: AuthenticatedUser,
    meta: RequestMeta,
  ) {
    const before = await this.get(id);
    const updated = await this.prisma.phoneRiskProfile.update({
      where: { id },
      data: {
        isWhitelisted: dto.whitelisted,
        status: dto.whitelisted ? "OK" : before.status,
        note: dto.note ?? before.note,
        setById: actor.id,
      },
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: dto.whitelisted ? "codRisk.whitelist" : "codRisk.unwhitelist",
      entityType: "PhoneRiskProfile",
      entityId: id,
      before: { isWhitelisted: before.isWhitelisted, status: before.status },
      after: { isWhitelisted: dto.whitelisted, status: updated.status },
      ...meta,
    });
    return updated;
  }
}
