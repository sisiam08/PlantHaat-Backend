import "dotenv/config";

import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import type { AppConfigService } from "../src/config/app-config.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { CloudinaryStorageDriver } from "../src/modules/uploads/storage/cloudinary-storage.driver";

/**
 * Migrates local `/uploads/...` URLs to Cloudinary and rewrites the stored URLs.
 * Dry-run by default:
 *   npx tsx scripts/migrate-uploads-to-cloudinary.ts
 *   npx tsx scripts/migrate-uploads-to-cloudinary.ts --apply
 */
const APPLY = process.argv.includes("--apply");
const API_URL = (process.env.API_URL ?? "http://localhost:5000").replace(/\/$/, "");
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "uploads";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
};

function localKey(url: string): string | null {
  const prefix = `${API_URL}/uploads/`;
  if (url.startsWith(prefix)) return url.slice(prefix.length);
  if (url.startsWith("/uploads/")) return url.slice("/uploads/".length);
  return null;
}

const driver = new CloudinaryStorageDriver({
  values: {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    CLOUDINARY_FOLDER: process.env.CLOUDINARY_FOLDER,
    CLOUDINARY_FOLDER_PREFIX:
      process.env.CLOUDINARY_FOLDER_PREFIX ?? `planthaat/${process.env.NODE_ENV ?? "development"}`,
  },
} as unknown as AppConfigService);

const prisma = new PrismaService();

type Row = { table: string; id: string; field: string; url: string };

async function collect(): Promise<Row[]> {
  const rows: Row[] = [];
  const productImages = await prisma.productImage.findMany({ select: { id: true, url: true } });
  rows.push(...productImages.map((r) => ({ table: "ProductImage", id: r.id, field: "url", url: r.url })));
  const shops = await prisma.shop.findMany({ select: { id: true, logoUrl: true, bannerUrl: true } });
  rows.push(
    ...shops.flatMap((r) => [
      { table: "Shop", id: r.id, field: "logoUrl", url: r.logoUrl ?? "" },
      { table: "Shop", id: r.id, field: "bannerUrl", url: r.bannerUrl ?? "" },
    ]),
  );
  const categories = await prisma.category.findMany({ select: { id: true, imageUrl: true } });
  rows.push(
    ...categories.map((r) => ({ table: "Category", id: r.id, field: "imageUrl", url: r.imageUrl ?? "" })),
  );
  const users = await prisma.user.findMany({ select: { id: true, avatarUrl: true } });
  rows.push(...users.map((r) => ({ table: "User", id: r.id, field: "avatarUrl", url: r.avatarUrl ?? "" })));
  const reviewImages = await prisma.reviewImage.findMany({ select: { id: true, url: true } });
  rows.push(...reviewImages.map((r) => ({ table: "ReviewImage", id: r.id, field: "url", url: r.url })));
  const attachments = await prisma.complaintAttachment.findMany({ select: { id: true, url: true } });
  rows.push(...attachments.map((r) => ({ table: "ComplaintAttachment", id: r.id, field: "url", url: r.url })));
  const banners = await prisma.banner.findMany({ select: { id: true, imageUrl: true } });
  rows.push(...banners.map((r) => ({ table: "Banner", id: r.id, field: "imageUrl", url: r.imageUrl })));
  const orderItems = await prisma.orderItem.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, imageUrl: true },
  });
  rows.push(
    ...orderItems.map((r) => ({
      table: "OrderItem",
      id: r.id,
      field: "imageUrl",
      url: r.imageUrl ?? "",
    })),
  );
  const shopOrders = await prisma.shopOrder.findMany({
    where: { deliveryProofUrl: { not: null } },
    select: { id: true, deliveryProofUrl: true },
  });
  rows.push(
    ...shopOrders.map((r) => ({
      table: "ShopOrder",
      id: r.id,
      field: "deliveryProofUrl",
      url: r.deliveryProofUrl ?? "",
    })),
  );
  const messages = await prisma.message.findMany({
    where: { attachmentUrl: { not: null } },
    select: { id: true, attachmentUrl: true },
  });
  rows.push(
    ...messages.map((r) => ({
      table: "Message",
      id: r.id,
      field: "attachmentUrl",
      url: r.attachmentUrl ?? "",
    })),
  );
  const proofs = await prisma.paymentSubmission.findMany({
    where: { proofUrl: { not: null } },
    select: { id: true, proofUrl: true },
  });
  rows.push(
    ...proofs.map((r) => ({
      table: "PaymentSubmission",
      id: r.id,
      field: "proofUrl",
      url: r.proofUrl ?? "",
    })),
  );
  return rows.filter((row) => row.url && localKey(row.url));
}

async function update(row: Row, newUrl: string): Promise<void> {
  switch (row.table) {
    case "ProductImage":
      await prisma.productImage.update({ where: { id: row.id }, data: { url: newUrl } });
      break;
    case "Shop":
      await prisma.shop.update({
        where: { id: row.id },
        data: row.field === "logoUrl" ? { logoUrl: newUrl } : { bannerUrl: newUrl },
      });
      break;
    case "Category":
      await prisma.category.update({ where: { id: row.id }, data: { imageUrl: newUrl } });
      break;
    case "User":
      await prisma.user.update({ where: { id: row.id }, data: { avatarUrl: newUrl } });
      break;
    case "ReviewImage":
      await prisma.reviewImage.update({ where: { id: row.id }, data: { url: newUrl } });
      break;
    case "ComplaintAttachment":
      await prisma.complaintAttachment.update({ where: { id: row.id }, data: { url: newUrl } });
      break;
    case "Banner":
      await prisma.banner.update({ where: { id: row.id }, data: { imageUrl: newUrl } });
      break;
    case "OrderItem":
      await prisma.orderItem.update({ where: { id: row.id }, data: { imageUrl: newUrl } });
      break;
    case "ShopOrder":
      await prisma.shopOrder.update({ where: { id: row.id }, data: { deliveryProofUrl: newUrl } });
      break;
    case "Message":
      await prisma.message.update({ where: { id: row.id }, data: { attachmentUrl: newUrl } });
      break;
    case "PaymentSubmission":
      await prisma.paymentSubmission.update({ where: { id: row.id }, data: { proofUrl: newUrl } });
      break;
  }
}

async function main(): Promise<void> {
  await prisma.$connect();
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.error("Missing Cloudinary env; set CLOUDINARY_* in backend/.env first.");
    process.exitCode = 1;
    return;
  }
  const rows = await collect();
  console.log(`${APPLY ? "APPLY" : "DRY-RUN"}: ${rows.length} local upload URL(s) found`);
  const uploaded = new Map<string, string>();
  let migrated = 0;
  for (const row of rows) {
    const key = localKey(row.url);
    if (!key) continue;
    console.log(`${row.table}.${row.field} ${row.id}  ${key}`);
    if (!APPLY) continue;
    try {
      const existing = uploaded.get(row.url);
      if (existing) {
        await update(row, existing);
        migrated += 1;
        continue;
      }
      const file = await readFile(join(resolve(process.cwd(), UPLOAD_DIR), "public", key));
      const ext = extname(key).toLowerCase();
      const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
      const stored = await driver.put({
        key,
        buffer: file,
        contentType,
        visibility: "public",
        resourceType: contentType.startsWith("image/") ? "image" : "raw",
      });
      uploaded.set(row.url, stored.url);
      await update(row, stored.url);
      migrated += 1;
    } catch (error) {
      console.error(`  ! failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`${APPLY ? `Migrated ${migrated}` : "No changes (dry-run)"}.`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
