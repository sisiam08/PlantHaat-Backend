import { Module } from "@nestjs/common";

import { AdminAuditController } from "./admin-audit.controller";
import { AdminProductsController } from "./admin-products.controller";
import { AdminProductsService } from "./admin-products.service";
import { AdminSellersController } from "./admin-sellers.controller";
import { AdminSellersService } from "./admin-sellers.service";
import { AdminShopsController } from "./admin-shops.controller";
import { AdminShopsService } from "./admin-shops.service";

@Module({
  controllers: [
    AdminSellersController,
    AdminShopsController,
    AdminProductsController,
    AdminAuditController,
  ],
  providers: [AdminSellersService, AdminShopsService, AdminProductsService],
})
export class AdminModule {}
