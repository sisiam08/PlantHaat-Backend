import { Module } from "@nestjs/common";

import { AdminRefundsController } from "./admin-refunds.controller";
import { RefundsService } from "./refunds.service";

@Module({
  controllers: [AdminRefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
