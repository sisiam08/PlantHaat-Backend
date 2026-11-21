import "dotenv/config";

import { PrismaService } from "../src/prisma/prisma.service";
import { UPLOAD_SCALAR_REFERENCES } from "../src/modules/uploads/upload-references";
import { parseCloudinaryUrl } from "../src/modules/uploads/storage/cloudinary-storage.driver";

/**
 * Idempotent backfill for DB image URLs that predate UploadedAsset tracking.
 * Dry-run by default; --apply only creates ATTACHED rows (no deletes, no URL
 * changes). Refuses production.
 *
 *   npm run uploads:backfill            # report only
 *   npm run uploads:backfill -- --apply
 */

const NODE_ENV = process.env.NODE_ENV ?? "development";
if (NODE_ENV === "production") {
  console.error("Refusing to backfill with NODE_ENV=production");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const prisma = new PrismaService();

const PURPOSE_BY_TABLE: Record<string, string> = {
  Product: "products",
  ProductImage: "products",
  Category: "categories",
  Shop: "shops",
  SellerProfile: "sellers",
  User: "avatars",
  Banner: "banners",
  PaymentSubmission: "payments",
  Complaint: "complaints",
};

export function purposeForTable(table: string): string {
  return PURPOSE_BY_TABLE[table] ?? "legacy";
}

type CountModel = {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
};

async function dbUrls(): Promise<{ table: string; column: string; id: string; url: string }[]> {
  const rows: { table: string; column: string; id: string; url: string }[] = [];
  for (const ref of UPLOAD_SCALAR_REFERENCES) {
    const model = (prisma as unknown as Record<string, CountModel>)[ref.model];
    const found = await model.findMany({
      where: { [ref.column]: { not: "" } },
      select: { id: true, [ref.column]: true },
    });
    for (const row of found) {
      const url = row[ref.column];
      if (typeof url === "string" && url.length > 0) {
        rows.push({ table: ref.table, column: ref.column, id: String(row.id), url });
      }
    }
  }
  return rows;
}

async function main(): Promise<void> {
  await prisma.$connect();
  const rows = await dbUrls();
  const tracked = await prisma.uploadedAsset.findMany({ select: { url: true, publicId: true } });
  const trackedUrls = new Set(tracked.map((row) => row.url).filter((url): url is string => !!url));
  const trackedIds = new Set(tracked.map((row) => row.publicId));

  const missing = new Map<string, { table: string; url: string; publicId: string; resourceType: string }>();
  const unparseable: string[] = [];
  for (const row of rows) {
    if (trackedUrls.has(row.url)) continue;
    const parsed = parseCloudinaryUrl(row.url);
    if (!parsed) {
      if (!unparseable.includes(row.url)) unparseable.push(row.url);
      continue;
    }
    if (trackedIds.has(parsed.publicId)) continue;
    missing.set(row.url, {
      table: row.table,
      url: row.url,
      publicId: parsed.publicId,
      resourceType: parsed.resourceType,
    });
  }

  const byTable = new Map<string, number>();
  for (const row of missing.values()) {
    const key = `${row.table} (${purposeForTable(row.table)})`;
    byTable.set(key, (byTable.get(key) ?? 0) + 1);
  }
  console.log(`DB URL rows: ${rows.length}; already tracked: ${rows.length - missing.size - unparseable.length}`);
  console.log(`Missing UploadedAsset rows: ${missing.size}`);
  for (const [key, count] of byTable) console.log(`  ${key}: ${count}`);
  console.log(`Non-Cloudinary/unparseable URLs: ${unparseable.length}`);
  for (const url of unparseable.slice(0, 10)) console.log(`  ${url.slice(0, 80)}`);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to create ATTACHED rows.");
    return;
  }

  let created = 0;
  for (const row of missing.values()) {
    const exists = await prisma.uploadedAsset.findFirst({
      where: { OR: [{ url: row.url }, { publicId: row.publicId }] },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.uploadedAsset.create({
      data: {
        publicId: row.publicId,
        resourceType: row.resourceType,
        url: row.url,
        purpose: purposeForTable(row.table),
        status: "ATTACHED",
        attachedAt: new Date(),
      },
    });
    created += 1;
  }
  console.log(`Created ${created} ATTACHED UploadedAsset row(s).`);

  const after = await dbUrls();
  const afterTracked = new Set(
    (await prisma.uploadedAsset.findMany({ select: { url: true } }))
      .map((row) => row.url)
      .filter((url): url is string => !!url),
  );
  const remaining = after.filter((row) => !afterTracked.has(row.url)).length;
  console.log(`Reconciliation: ${after.length} DB URL rows, ${remaining} without tracking.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "backfill failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
