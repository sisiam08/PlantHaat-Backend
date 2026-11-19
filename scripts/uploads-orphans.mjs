import "dotenv/config";

import { NestFactory } from "@nestjs/core";

/**
 * Manual orphan sweep against the compiled build. Dry-run by default:
 *   npm run uploads:orphans
 *   npm run uploads:orphans -- --apply
 */
async function main() {
  const apply = process.argv.includes("--apply");
  const { AppModule } = await import("../dist/app.module.js");
  const { UploadsMaintenanceService } = await import(
    "../dist/modules/uploads/uploads-maintenance.service.js"
  );
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    const service = app.get(UploadsMaintenanceService);
    const summary = await service.purgeOrphans({ dryRun: !apply });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "uploads:orphans failed");
  process.exitCode = 1;
});
