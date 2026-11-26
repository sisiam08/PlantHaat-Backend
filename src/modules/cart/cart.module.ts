import { Module } from "@nestjs/common";

import { DeliveryQuoteModule } from "../delivery-quote/delivery-quote.module";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";

@Module({
  imports: [DeliveryQuoteModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
