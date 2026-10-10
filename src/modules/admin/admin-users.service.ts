import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import { hashPassword } from "../../common/utils/password";
import type { RequestMeta } from "../../common/utils/request-meta";
import type { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateAdminUserDto, QueryUsersDto } from "./dto/admin-users.dto";

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async list(query: QueryUsersDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: SAFE_USER_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async get(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...SAFE_USER_SELECT,
        _count: { select: { orders: true, addresses: true, reviews: true, complaints: true } },
        sellerProfile: { select: { id: true, status: true, businessName: true } },
      },
    });
    if (!user) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "User not found");
    }
    return user;
  }

  async suspend(id: string, actor: AuthenticatedUser, meta: RequestMeta) {
    const user = await this.get(id);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status: "SUSPENDED" } }),
      this.prisma.refreshSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: "ACCOUNT_SUSPENDED" },
      }),
    ]);
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "user.suspend",
      entityType: "User",
      entityId: id,
      before: { status: user.status },
      after: { status: "SUSPENDED" },
      ...meta,
    });
    this.events.emit("user.suspended", { userId: id });
    return { id, status: "SUSPENDED" };
  }

  async reactivate(id: string, actor: AuthenticatedUser, meta: RequestMeta) {
    const user = await this.get(id);
    await this.prisma.user.update({ where: { id }, data: { status: "ACTIVE" } });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "user.reactivate",
      entityType: "User",
      entityId: id,
      before: { status: user.status },
      after: { status: "ACTIVE" },
      ...meta,
    });
    return { id, status: "ACTIVE" };
  }

  async createAdmin(dto: CreateAdminUserDto, actor: AuthenticatedUser, meta: RequestMeta) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw AppException.conflict(
        ErrorCode.EMAIL_ALREADY_REGISTERED,
        "Email is already registered",
      );
    }
    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        passwordHash,
        role: "ADMIN",
        emailVerifiedAt: new Date(),
      },
      select: SAFE_USER_SELECT,
    });
    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      action: "user.create_admin",
      entityType: "User",
      entityId: user.id,
      after: { email: user.email, role: "ADMIN" },
      ...meta,
    });
    return user;
  }
}
