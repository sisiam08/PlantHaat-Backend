import { Module } from "@nestjs/common";

import { AdminAuditController } from "./admin-audit.controller";
import { AdminSellersController } from "./admin-sellers.controller";
import { AdminSellersService } from "./admin-sellers.service";
import { AdminShopsController } from "./admin-shops.controller";
import { AdminShopsService } from "./admin-shops.service";

@Module({
  controllers: [AdminSellersController, AdminShopsController, AdminAuditController],
  providers: [AdminSellersService, AdminShopsService],
})
export class AdminModule {}
