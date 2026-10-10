import { Module } from "@nestjs/common";

/**
 * Payments module.
 *
 * v1 implements Cash on Delivery only (handled inside the orders/checkout
 * flow). Online gateways (PipaPay, bKash, ...) are implemented later against
 * the `PaymentProvider` interface; their documentation is not available yet,
 * so no gateway adapter is registered here.
 */
@Module({})
export class PaymentsModule {}
