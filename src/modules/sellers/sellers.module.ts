import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { UploadsModule } from "../uploads/uploads.module";
import { DeliveryService } from "./delivery.service";
import { SellerApplicationController } from "./seller-application.controller";
import { SellerContextService } from "./seller-context.service";
import { SellerShopController } from "./seller-shop.controller";
import { SellersService } from "./sellers.service";
import { ShopsService } from "./shops.service";

@Module({
  imports: [NotificationsModule, UploadsModule],
  controllers: [SellerApplicationController, SellerShopController],
  providers: [SellersService, ShopsService, DeliveryService, SellerContextService],
  exports: [SellersService, ShopsService, DeliveryService, SellerContextService],
})
export class SellersModule {}
