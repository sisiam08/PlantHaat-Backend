import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async create(input: CreateNotificationInput): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: toInputJson(input.data),
      },
    });
    const unreadCount = await this.countUnread(input.userId);
    this.events.emit("notification.created", {
      userId: input.userId,
      notification,
      unreadCount,
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
    const userIds = admins.map((admin) => admin.id);
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: toInputJson(input.data),
      })),
    });
    this.events.emit("notifications.bulk_created", { userIds });
  }

  async list(
    userId: string,
    query: QueryNotificationsDto,
  ): Promise<PaginatedResult<unknown>> {
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
    return { count: await this.countUnread(userId) };
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
    this.events.emit("notification.read", {
      userId,
      unreadCount: await this.countUnread(userId),
    });
    return { read: true };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    this.events.emit("notification.read_all", { userId, unreadCount: 0 });
    return { updated: result.count };
  }

  private countUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }
}
