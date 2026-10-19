import { Module } from "@nestjs/common";

import { CommissionsModule } from "../commissions/commissions.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AdminOrdersController } from "./admin-orders.controller";
import { AdminStuckOrdersController } from "./admin-stuck-orders.controller";
import { CheckoutController } from "./checkout.controller";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { SellerOrdersController } from "./seller-orders.controller";

@Module({
  imports: [CommissionsModule, NotificationsModule],
  controllers: [
    CheckoutController,
    OrdersController,
    SellerOrdersController,
    AdminOrdersController,
    AdminStuckOrdersController,
  ],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
