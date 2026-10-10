import { Injectable } from "@nestjs/common";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import { toInputJson } from "../../common/utils/json";
import type { NotificationType } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";
import type { QueryNotificationsDto } from "./dto/query-notifications.dto";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: unknown;
}

export interface AdminNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: unknown;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: toInputJson(input.data),
      },
    });
  }

  async createForAdmins(input: AdminNotificationInput): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
    if (admins.length === 0) {
      return;
    }
    await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type: input.type,
        title: input.title,
        body: input.body,
        data: toInputJson(input.data),
      })),
    });
  }

  async list(userId: string, query: QueryNotificationsDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const where = {
      userId,
      ...(query.unread ? { readAt: null } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginate(rows, total, page, limit);
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, id: string): Promise<{ read: true }> {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!notification) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Notification not found");
    }
    await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return { read: true };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
