import "dotenv/config";

import { AppConfigService } from "../src/config/app-config.service";
import { validateEnv } from "../src/config/env.validation";
import type { PrismaService } from "../src/prisma/prisma.service";
import { createPrismaClient } from "../src/prisma/prisma-client";
import { HIGHLIGHT_PLACEMENT } from "../src/modules/content/highlights.validation";
import { UploadsService } from "../src/modules/uploads/uploads.service";
import { resolveStorageDriver } from "../src/modules/uploads/storage/storage.module";

const IMPORT_MARKER = "[seed:home-highlights]";

function guardDevDatabase(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refused: removal script must not run in production");
  }
  const url = new URL(process.env.DATABASE_URL ?? "");
  const database = url.pathname.replace(/^\//, "");
  if (!/neon\.tech$/i.test(url.hostname) || database !== "neondb") {
    throw new Error("Refused: DATABASE_URL is not the approved dev database");
  }
}

async function main() {
  guardDevDatabase();
  const prisma = createPrismaClient();
  const config = new AppConfigService(validateEnv(process.env));
  const uploads = new UploadsService(
    resolveStorageDriver(config),
    prisma as unknown as PrismaService,
  );
  const rows = await prisma.banner.findMany({
    where: { placement: HIGHLIGHT_PLACEMENT, title: { startsWith: IMPORT_MARKER } },
    select: { id: true, imageUrl: true, mobileImageUrl: true },
  });
  for (const row of rows) {
    await prisma.banner.delete({ where: { id: row.id } });
    for (const url of [row.imageUrl, row.mobileImageUrl]) {
      if (url) await uploads.deleteByUrl(url);
    }
  }
  await prisma.$disconnect();
  process.stdout.write(`Removed ${rows.length} imported slides.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Removal failed"}\n`);
  process.exitCode = 1;
});
