import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import {
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../../common/swagger/api-response.decorators";
import { NotificationItemDto, UnreadCountDto } from "./dto/notification.dto";
import { QueryNotificationsDto } from "./dto/query-notifications.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("Notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's notifications" })
  @ApiPaginatedResponse(NotificationItemDto)
  list(@CurrentUser("id") userId: string, @Query() query: QueryNotificationsDto) {
    return this.notificationsService.list(userId, query);
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Count the current user's unread notifications" })
  @ApiEnvelopeResponse(UnreadCountDto)
  unreadCount(@CurrentUser("id") userId: string) {
    return this.notificationsService.unreadCount(userId);
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Mark a notification as read" })
  markRead(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.notificationsService.markRead(userId, id);
  }

  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark all notifications as read" })
  markAllRead(@CurrentUser("id") userId: string) {
    return this.notificationsService.markAllRead(userId);
  }
}
