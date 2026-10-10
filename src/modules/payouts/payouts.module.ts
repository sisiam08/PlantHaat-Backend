import { Module } from "@nestjs/common";

import { SellersModule } from "../sellers/sellers.module";
import { AdminPayoutsController } from "./admin-payouts.controller";
import { PayoutsService } from "./payouts.service";
import { SellerEarningsController } from "./seller-earnings.controller";

@Module({
  imports: [SellersModule],
  controllers: [AdminPayoutsController, SellerEarningsController],
  providers: [PayoutsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
