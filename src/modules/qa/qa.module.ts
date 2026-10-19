import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { QaAdminController } from "./qa-admin.controller";
import { QaPublicController } from "./qa-public.controller";
import { QaSellerController } from "./qa-seller.controller";
import { QaService } from "./qa.service";

@Module({
  imports: [NotificationsModule, AuditModule],
  controllers: [QaPublicController, QaSellerController, QaAdminController],
  providers: [QaService],
  exports: [QaService],
})
export class QaModule {}
