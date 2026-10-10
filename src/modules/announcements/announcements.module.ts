import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { AdminAnnouncementsController } from "./admin-announcements.controller";
import { AnnouncementsService } from "./announcements.service";

@Module({
  imports: [NotificationsModule],
  controllers: [AdminAnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
