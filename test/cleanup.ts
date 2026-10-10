import type { PrismaService } from "../src/prisma/prisma.service";

/** Deletes rows in dependency order so Restrict foreign keys never block. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.reviewReport.deleteMany();
  await prisma.reviewImage.deleteMany();
  await prisma.review.deleteMany();
  await prisma.complaintComment.deleteMany();
  await prisma.complaintAttachment.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.cancellationRequest.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.shopOrder.deleteMany();
  await prisma.order.deleteMany();
  await prisma.commissionRule.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.shopDeliveryZone.deleteMany();
  await prisma.zoneDistrict.deleteMany();
  await prisma.sellerDocument.deleteMany();
  await prisma.sellerPayoutAccount.deleteMany();
  await prisma.inventoryLog.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.sellerProfile.deleteMany();
  await prisma.refreshSession.deleteMany();
  await prisma.authToken.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.district.deleteMany();
  await prisma.banner.deleteMany();
  await prisma.homepageSection.deleteMany();
}
