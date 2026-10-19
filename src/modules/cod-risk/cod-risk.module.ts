import { Module } from "@nestjs/common";

import { NotificationsModule } from "../notifications/notifications.module";
import { CodRiskController } from "./cod-risk.controller";
import { CodRiskService } from "./cod-risk.service";

@Module({
  imports: [NotificationsModule],
  controllers: [CodRiskController],
  providers: [CodRiskService],
  exports: [CodRiskService],
})
export class CodRiskModule {}
