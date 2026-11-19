import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { OrdersModule } from "../orders/orders.module";
import { UploadsModule } from "../uploads/uploads.module";
import { AdminComplaintsController } from "./admin-complaints.controller";
import { ComplaintsController } from "./complaints.controller";
import { ComplaintsService } from "./complaints.service";
import { SellerComplaintsController } from "./seller-complaints.controller";

@Module({
  imports: [NotificationsModule, OrdersModule, UploadsModule],
  controllers: [ComplaintsController, SellerComplaintsController, AdminComplaintsController],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
