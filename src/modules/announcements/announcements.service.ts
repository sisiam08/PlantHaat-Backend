import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { resolvePagination } from "../../common/dto/pagination-query.dto";
import { AppException } from "../../common/errors/app.exception";
import { ErrorCode } from "../../common/errors/error-codes";
import { paginate, type PaginatedResult } from "../../common/types/paginated";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import type {
  CreateAnnouncementDto,
  QueryAnnouncementsDto,
  UpdateAnnouncementDto,
} from "./dto/announcement.dto";

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly events: EventEmitter2,
  ) {}

  async list(query: QueryAnnouncementsDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = resolvePagination(query);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.announcement.count(),
    ]);
    return paginate(rows, total, page, limit);
  }

  async create(dto: CreateAnnouncementDto, actorId: string) {
    const publishedAt = dto.publishedAt ? new Date(dto.publishedAt) : new Date();
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        body: dto.body,
        audience: dto.audience ?? "ALL",
        publishedAt,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: actorId,
      },
    });
    if (publishedAt.getTime() <= Date.now()) {
      await this.fanOut(announcement);
    }
    return announcement;
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    await this.getOrThrow(id);
    return this.prisma.announcement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
        ...(dto.publishedAt !== undefined ? { publishedAt: new Date(dto.publishedAt) } : {}),
        ...(dto.expiresAt !== undefined
          ? { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }
          : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);
    await this.prisma.announcement.delete({ where: { id } });
  }

  private async fanOut(announcement: {
    id: string;
    title: string;
    body: string;
    audience: string;
  }): Promise<void> {
    const roleFilter =
      announcement.audience === "CUSTOMERS"
        ? { role: "CUSTOMER" as const }
        : announcement.audience === "SELLERS"
          ? { role: "SELLER" as const }
          : {};
    const users = await this.prisma.user.findMany({
      where: { status: "ACTIVE", deletedAt: null, ...roleFilter },
      select: { id: true },
    });
    if (users.length === 0) {
      return;
    }
    await this.prisma.notification.createMany({
      data: users.map((user) => ({
        userId: user.id,
        type: "ANNOUNCEMENT" as const,
        title: announcement.title,
        body: announcement.body,
        data: { announcementId: announcement.id },
      })),
    });
    this.events.emit("notifications.bulk_created", { userIds: users.map((user) => user.id) });
  }

  private async getOrThrow(id: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!announcement) {
      throw AppException.notFound(ErrorCode.NOT_FOUND, "Announcement not found");
    }
    return announcement;
  }
}
