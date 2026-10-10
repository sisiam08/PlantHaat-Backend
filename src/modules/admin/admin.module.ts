import { Module } from "@nestjs/common";

import { AdminAuditController } from "./admin-audit.controller";
import { AdminCategoriesController } from "./admin-categories.controller";
import { AdminCategoriesService } from "./admin-categories.service";
import { AdminPaymentsController } from "./admin-payments.controller";
import { AdminPaymentsService } from "./admin-payments.service";
import { AdminProductsController } from "./admin-products.controller";
import { AdminProductsService } from "./admin-products.service";
import { AdminSellersController } from "./admin-sellers.controller";
import { AdminSellersService } from "./admin-sellers.service";
import { AdminShopsController } from "./admin-shops.controller";
import { AdminShopsService } from "./admin-shops.service";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";

@Module({
  controllers: [
    AdminUsersController,
    AdminSellersController,
    AdminShopsController,
    AdminProductsController,
    AdminCategoriesController,
    AdminPaymentsController,
    AdminAuditController,
  ],
  providers: [
    AdminUsersService,
    AdminSellersService,
    AdminShopsService,
    AdminProductsService,
    AdminCategoriesService,
    AdminPaymentsService,
  ],
})
export class AdminModule {}
