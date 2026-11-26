import { Module } from "@nestjs/common";

import { CodRiskModule } from "../cod-risk/cod-risk.module";
import { DeliveryQuoteModule } from "../delivery-quote/delivery-quote.module";
import { CommissionsModule } from "../commissions/commissions.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PaymentsModule } from "../payments/payments.module";
import { UploadsModule } from "../uploads/uploads.module";
import { AdminOrdersController } from "./admin-orders.controller";
import { AdminStuckOrdersController } from "./admin-stuck-orders.controller";
import { CheckoutController } from "./checkout.controller";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { SellerOrdersController } from "./seller-orders.controller";

@Module({
  imports: [
    CommissionsModule,
    NotificationsModule,
    CodRiskModule,
    DeliveryQuoteModule,
    PaymentsModule,
    UploadsModule,
  ],
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

