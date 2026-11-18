import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { SellersModule } from "../sellers/sellers.module";
import { AdminWalletController } from "./admin-wallet.controller";
import { SellerWalletController } from "./seller-wallet.controller";
import { WalletService } from "./wallet.service";

@Module({
  imports: [SellersModule, NotificationsModule],
  controllers: [SellerWalletController, AdminWalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
