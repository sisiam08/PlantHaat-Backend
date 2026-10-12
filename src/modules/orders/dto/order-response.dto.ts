import { ApiProperty } from "@nestjs/swagger";

import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../../../generated/prisma/enums";
import { SellerOrderPaymentDto } from "./seller-order-response.dto";

export class OrderListShopOrderRefDto {
  @ApiProperty({ enum: Object.values(OrderStatus) }) status!: OrderStatus;
  @ApiProperty() shopId!: string;
}

export class OrderListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderNumber!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty({ nullable: true, type: String }) idempotencyKey!: string | null;
  @ApiProperty() contactName!: string;
  @ApiProperty() contactPhone!: string;
  @ApiProperty() shippingDistrictId!: number;
  @ApiProperty() shippingDistrictName!: string;
  @ApiProperty() shippingArea!: string;
  @ApiProperty() shippingAddressLine!: string;
  @ApiProperty({ nullable: true, type: String }) shippingPostalCode!: string | null;
  @ApiProperty({ nullable: true, type: String }) deliveryNote!: string | null;
  @ApiProperty({ enum: Object.values(PaymentMethod) }) paymentMethod!: PaymentMethod;
  @ApiProperty({ enum: Object.values(PaymentStatus) })
  paymentStatus!: PaymentStatus;
  @ApiProperty({ type: String, description: "Decimal as string" }) subtotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) deliveryTotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) discountTotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) grandTotal!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: String, format: "date-time" }) placedAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
  @ApiProperty({ example: "PARTIALLY_DELIVERED", description: "Derived from the shop orders' states" })
  overallStatus!: string;
  @ApiProperty({ type: [OrderListShopOrderRefDto] })
  shopOrders!: OrderListShopOrderRefDto[];
  @ApiProperty({ type: [SellerOrderPaymentDto] }) payments!: SellerOrderPaymentDto[];
}

export class OrderDetailDto {
  @ApiProperty({ nullable: true, type: String }) id!: string | null;
  @ApiProperty({ nullable: true, type: String }) orderNumber!: string | null;
  @ApiProperty({ nullable: true, type: String, example: "PENDING" }) overallStatus!: string | null;
  @ApiProperty({ nullable: true, type: String, description: "Decimal as string" }) status!: string | null;
  @ApiProperty({ type: String, description: "Decimal as string" }) subtotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) deliveryTotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) grandTotal!: string;
  @ApiProperty({ nullable: true, type: String }) paymentMethod!: string | null;
  @ApiProperty({ nullable: true, type: String }) paymentStatus!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) placedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) createdAt!: string | null;
  @ApiProperty({ type: [Object], description: "Shop orders with items, status history and payments" })
  shopOrders?: Record<string, unknown>[];
  @ApiProperty({ type: [Object] }) items?: Record<string, unknown>[];
  @ApiProperty({ type: [Object] }) statusHistory?: Record<string, unknown>[];
  @ApiProperty({ type: [Object] }) payments?: Record<string, unknown>[];
}
