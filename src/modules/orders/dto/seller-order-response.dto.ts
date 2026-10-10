import { ApiProperty } from "@nestjs/swagger";

import {
  CancellationRequestStatus,
  CancelledBy,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
} from "../../../generated/prisma/enums";

export class SellerOrderItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() shopOrderId!: string;
  @ApiProperty({ nullable: true, type: String }) productId!: string | null;
  @ApiProperty({ nullable: true, type: String }) variantId!: string | null;
  @ApiProperty() productName!: string;
  @ApiProperty() variantName!: string;
  @ApiProperty({ nullable: true, type: String }) imageUrl!: string | null;
  @ApiProperty({ type: String, description: "Decimal as string" }) unitPrice!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty({ type: String, description: "Decimal as string" }) lineTotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) commissionRate!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) commissionAmount!: string;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class SellerOrderStatusHistoryDto {
  @ApiProperty() id!: string;
  @ApiProperty() shopOrderId!: string;
  @ApiProperty({ nullable: true, enum: Object.values(OrderStatus) })
  fromStatus!: OrderStatus | null;
  @ApiProperty({ enum: Object.values(OrderStatus) }) toStatus!: OrderStatus;
  @ApiProperty({ nullable: true, type: String }) changedById!: string | null;
  @ApiProperty({ nullable: true, enum: Object.values(Role) }) changedByRole!: Role | null;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
}

export class SellerOrderPaymentDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty({ nullable: true, type: String }) shopOrderId!: string | null;
  @ApiProperty({ enum: Object.values(PaymentMethod) }) method!: PaymentMethod;
  @ApiProperty({ nullable: true, type: String }) provider!: string | null;
  @ApiProperty({ enum: Object.values(PaymentStatus) }) status!: PaymentStatus;
  @ApiProperty({ type: String, description: "Decimal as string" }) amount!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ nullable: true, type: String }) providerTxnId!: string | null;
  @ApiProperty({ type: Object, nullable: true }) providerPayload!: Record<string, unknown> | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) paidAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) failedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) failureReason!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
}

export class OrderShopRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class SellerOrderRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderNumber!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty({ enum: Object.values(PaymentMethod) }) paymentMethod!: PaymentMethod;
}

export class SellerShopOrderDto {
  @ApiProperty() id!: string;
  @ApiProperty() shopOrderNumber!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() shopId!: string;
  @ApiProperty({ enum: Object.values(OrderStatus) }) status!: OrderStatus;
  @ApiProperty({ type: String, description: "Decimal as string" }) subtotal!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) deliveryCharge!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) total!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) commissionAmount!: string;
  @ApiProperty({ type: String, description: "Decimal as string" }) sellerNetAmount!: string;
  @ApiProperty({ nullable: true, type: String }) courierName!: string | null;
  @ApiProperty({ nullable: true, type: String }) trackingCode!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  estimatedDeliveryFrom!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" })
  estimatedDeliveryTo!: string | null;
  @ApiProperty({ nullable: true, type: String }) sellerNote!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) confirmedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) packedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) shippedAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) deliveredAt!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) cancelledAt!: string | null;
  @ApiProperty({ nullable: true, enum: Object.values(CancelledBy) })
  cancelledBy!: CancelledBy | null;
  @ApiProperty({ nullable: true, type: String }) cancelReason!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt!: string;
  @ApiProperty({ type: [SellerOrderItemDto] }) items!: SellerOrderItemDto[];
  @ApiProperty({ type: [SellerOrderStatusHistoryDto] })
  statusHistory!: SellerOrderStatusHistoryDto[];
  @ApiProperty({ type: [SellerOrderPaymentDto] }) payments!: SellerOrderPaymentDto[];
  @ApiProperty({ type: OrderShopRefDto }) shop!: OrderShopRefDto;
  @ApiProperty({ type: SellerOrderRefDto }) order!: SellerOrderRefDto;
}

export class SellerCancellationShopOrderRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() shopOrderNumber!: string;
  @ApiProperty({ enum: Object.values(OrderStatus) }) status!: OrderStatus;
  @ApiProperty({ type: String, description: "Decimal as string" }) total!: string;
}

export class SellerCancellationRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() shopOrderId!: string;
  @ApiProperty() requestedById!: string;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: Object.values(CancellationRequestStatus) })
  status!: CancellationRequestStatus;
  @ApiProperty({ nullable: true, type: String }) respondedById!: string | null;
  @ApiProperty({ nullable: true, type: String }) responseNote!: string | null;
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) respondedAt!: string | null;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({ type: SellerCancellationShopOrderRefDto })
  shopOrder!: SellerCancellationShopOrderRefDto;
}

export class CancellationRespondResultDto {
  @ApiProperty({ example: true }) handled!: boolean;
  @ApiProperty({ example: true }) approved!: boolean;
}
