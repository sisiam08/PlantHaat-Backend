import { Module } from "@nestjs/common";

import { AdminCommissionRulesController } from "./admin-commission-rules.controller";
import { CommissionsService } from "./commissions.service";

@Module({
  controllers: [AdminCommissionRulesController],
  providers: [CommissionsService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
