import type { PrismaService } from "../src/prisma/prisma.service";

/** Deletes rows in dependency order so Restrict foreign keys never block. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
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
