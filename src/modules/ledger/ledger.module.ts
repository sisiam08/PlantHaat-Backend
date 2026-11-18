import { Global, Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { LedgerService } from "./ledger.service";
import { SettlementScheduler } from "./settlement.scheduler";

@Global()
@Module({
  imports: [NotificationsModule],
  providers: [LedgerService, SettlementScheduler],
  exports: [LedgerService],
})
export class LedgerModule {}
