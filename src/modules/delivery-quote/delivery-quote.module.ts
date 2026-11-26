import { Module } from "@nestjs/common";

import { AdminDeliveryRatesController } from "./admin-delivery-rates.controller";
import { AdminDeliveryRatesService } from "./admin-delivery-rates.service";
import { DeliveryQuoteService } from "./delivery-quote.service";
import { PublicDeliveryQuoteController } from "./public-delivery-quote.controller";
import { SteadfastQuoteClient } from "./steadfast-quote.client";

@Module({
  controllers: [AdminDeliveryRatesController, PublicDeliveryQuoteController],
  providers: [DeliveryQuoteService, SteadfastQuoteClient, AdminDeliveryRatesService],
  exports: [DeliveryQuoteService, SteadfastQuoteClient],
})
export class DeliveryQuoteModule {}


