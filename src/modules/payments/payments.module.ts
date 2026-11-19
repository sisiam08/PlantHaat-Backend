import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SettingsModule } from "../settings/settings.module";
import { UploadsModule } from "../uploads/uploads.module";
import { AdminAdvancePaymentsController } from "./admin-payments.controller";
import { PaymentsController } from "./payments.controller";
import { PaymentsScheduler } from "./payments.scheduler";
import { PaymentsService } from "./payments.service";
import { SellerPaymentsController } from "./seller-payments.controller";

@Module({
  imports: [SettingsModule, NotificationsModule, AuditModule, UploadsModule],
  controllers: [PaymentsController, AdminAdvancePaymentsController, SellerPaymentsController],
  providers: [PaymentsService, PaymentsScheduler],
  exports: [PaymentsService],
})
export class PaymentsModule {}
