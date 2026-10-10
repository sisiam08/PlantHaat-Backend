import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { PrismaService } from "../../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { buildSellerApprovedEmail, buildSellerRejectedEmail } from "../mail/mail.templates";
import { NotificationsService } from "./notifications.service";

export interface SellerApprovedEvent {
  sellerProfileId: string;
  userId: string;
  businessName: string;
}

export interface SellerRejectedEvent {
  sellerProfileId: string;
  userId: string;
  businessName: string;
  reason: string;
}

export interface ProductModeratedEvent {
  productId: string;
  userId: string;
  productName: string;
  status: "ACTIVE" | "REJECTED";
}

export interface OrderPlacedEvent {
  orderId: string;
  customerId: string;
  sellerUserIds: string[];
}

export interface OrderStatusChangedEvent {
  shopOrderId: string;
  orderId: string;
  customerId: string;
  sellerUserId: string;
  status: string;
}

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent("seller.approved", { async: true })
  async handleSellerApproved(payload: SellerApprovedEvent): Promise<void> {
    await this.notifications.create({
      userId: payload.userId,
      type: "SELLER_APPROVED",
      title: "Seller application approved",
      body: `Your seller application for "${payload.businessName}" has been approved.`,
      data: { sellerProfileId: payload.sellerProfileId },
    });
    await this.sendEmail(payload.userId, (name) =>
      buildSellerApprovedEmail({ name, shopName: payload.businessName }),
    );
  }

  @OnEvent("seller.rejected", { async: true })
  async handleSellerRejected(payload: SellerRejectedEvent): Promise<void> {
    await this.notifications.create({
      userId: payload.userId,
      type: "SELLER_REJECTED",
      title: "Seller application needs attention",
      body: `Your seller application was rejected: ${payload.reason}`,
      data: { sellerProfileId: payload.sellerProfileId },
    });
    await this.sendEmail(payload.userId, (name) =>
      buildSellerRejectedEmail({ name, reason: payload.reason }),
    );
  }

  @OnEvent("product.moderated", { async: true })
  async handleProductModerated(payload: ProductModeratedEvent): Promise<void> {
    const approved = payload.status === "ACTIVE";
    await this.notifications.create({
      userId: payload.userId,
      type: approved ? "PRODUCT_APPROVED" : "PRODUCT_REJECTED",
      title: approved ? "Product approved" : "Product rejected",
      body: `"${payload.productName}" was ${approved ? "approved" : "rejected"}.`,
      data: { productId: payload.productId },
    });
  }

  @OnEvent("order.placed", { async: true })
  async handleOrderPlaced(payload: OrderPlacedEvent): Promise<void> {
    for (const userId of payload.sellerUserIds) {
      await this.notifications.create({
        userId,
        type: "ORDER_PLACED",
        title: "New order",
        body: "You have a new order to confirm.",
        data: { orderId: payload.orderId },
      });
    }
  }

  @OnEvent("order.status_changed", { async: true })
  async handleOrderStatusChanged(payload: OrderStatusChangedEvent): Promise<void> {
    await this.notifications.create({
      userId: payload.customerId,
      type: payload.status === "CANCELLED" ? "ORDER_CANCELLED" : "ORDER_STATUS_CHANGED",
      title: "Order update",
      body: `Your order is now ${payload.status.replace(/_/g, " ").toLowerCase()}.`,
      data: { shopOrderId: payload.shopOrderId, orderId: payload.orderId },
    });
  }

  private async sendEmail(
    userId: string,
    build: (name: string) => { subject: string; text: string },
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (user) {
      this.mail.queue({ ...build(user.name), to: user.email });
    }
  }
}
