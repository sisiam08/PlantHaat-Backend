import "dotenv/config";

import { v2 as cloudinary } from "cloudinary";

import { PrismaService } from "../src/prisma/prisma.service";
import { UPLOAD_SCALAR_REFERENCES } from "../src/modules/uploads/upload-references";
import { UploadReferencesService } from "../src/modules/uploads/upload-references.service";
import { parseCloudinaryUrl } from "../src/modules/uploads/storage/cloudinary-storage.driver";

/**
 * Read-only upload reconciliation. Refuses production. Lists only; never deletes.
 *   npm run uploads:reconcile
 */
const NODE_ENV = process.env.NODE_ENV ?? "development";
if (NODE_ENV === "production") {
  console.error("Refusing to run reconciliation with NODE_ENV=production");
  process.exit(1);
}

const prefix = (
  process.env.CLOUDINARY_FOLDER ??
  process.env.CLOUDINARY_FOLDER_PREFIX ??
  `planthaat/${NODE_ENV}`
).replace(/^\/+|\/+$/g, "");

const prisma = new PrismaService();

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
  const references = new UploadReferencesService(prisma);
  const rows = await dbUrls();
  const tracked = await prisma.uploadedAsset.findMany({
    select: { id: true, publicId: true, url: true, status: true, purpose: true },
  });
  const trackedUrls = new Set(tracked.map((row) => row.url).filter((url): url is string => !!url));

  const missingTracking = rows.filter((row) => !trackedUrls.has(row.url));
  console.log(`DB URL rows: ${rows.length}; without UploadedAsset row: ${missingTracking.length}`);
  const byTable = new Map<string, number>();
  for (const row of missingTracking) {
    byTable.set(`${row.table}.${row.column}`, (byTable.get(`${row.table}.${row.column}`) ?? 0) + 1);
  }
  for (const [key, count] of byTable) console.log(`  ${key}: ${count} record(s)`);
  for (const row of missingTracking.slice(0, 20)) {
    console.log(`  ${row.table}.${row.column} id=${row.id}`);
  }

  const orphanAttached: typeof tracked = [];
  for (const row of tracked.filter((item) => item.status === "ATTACHED" && item.url)) {
    const reference = await references.findReference(row.url!);
    if (!reference) orphanAttached.push(row);
  }
  console.log(`ATTACHED rows with no current reference: ${orphanAttached.length}`);
  for (const row of orphanAttached.slice(0, 20)) {
    console.log(`  id=${row.id} purpose=${row.purpose} publicId=${row.publicId}`);
  }

  const knownCloudinaryIds = new Set<string>();
  for (const row of tracked) knownCloudinaryIds.add(row.publicId);
  for (const row of rows) {
    const parsed = parseCloudinaryUrl(row.url);
    if (parsed) knownCloudinaryIds.add(parsed.publicId);
  }

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.log("Cloudinary listing skipped: credentials not configured.");
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    const unknown: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await cloudinary.api.resources({
        type: "upload",
        prefix: `${prefix}/`,
        max_results: 500,
        next_cursor: cursor,
      });
      for (const resource of page.resources ?? []) {
        if (!knownCloudinaryIds.has(resource.public_id)) unknown.push(resource.public_id);
      }
      cursor = page.next_cursor;
    } while (cursor);
    console.log(`Cloudinary assets under ${prefix}/ unknown to the DB: ${unknown.length}`);
    for (const publicId of unknown.slice(0, 20)) console.log(`  publicId=${publicId}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : "uploads:reconcile failed");
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
