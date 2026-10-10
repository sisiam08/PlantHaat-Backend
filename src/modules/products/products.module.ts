import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { SellersModule } from "../sellers/sellers.module";
import { PublicProductsController } from "./public-products.controller";
import { PublicProductsService } from "./public-products.service";
import { SellerProductsController } from "./seller-products.controller";
import { SellerProductsService } from "./seller-products.service";

@Module({
  imports: [SellersModule, NotificationsModule],
  controllers: [SellerProductsController, PublicProductsController],
  providers: [SellerProductsService, PublicProductsService],
  exports: [SellerProductsService, PublicProductsService],
})
export class ProductsModule {}
