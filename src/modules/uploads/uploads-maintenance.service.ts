import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { PrismaService } from "../../prisma/prisma.service";
import { STORAGE_SERVICE, type StorageService } from "./storage/storage.types";

const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

/**
 * Orphan control: uploads that were never attached to an entity are removed
 * from storage and the tracking table after 24 h. Runs hourly; single-instance
 * by design (a shared advisory lock is needed for multi-instance deployments).
 */
@Injectable()
export class UploadsMaintenanceService {
  private readonly logger = new Logger(UploadsMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeOrphans(): Promise<void> {
    const cutoff = new Date(Date.now() - ORPHAN_AGE_MS);
    const rows = await this.prisma.uploadedAsset.findMany({
      where: { status: "PENDING", createdAt: { lt: cutoff } },
      take: BATCH_SIZE,
      orderBy: { createdAt: "asc" },
    });
    let removed = 0;
    for (const row of rows) {
      const visibility = row.publicId.includes("/private/") ? "private" : "public";
      try {
        await this.storage.delete(row.publicId, visibility);
      } catch (error) {
        this.logger.debug(
          `Orphan delete failed for ${row.publicId}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
      await this.prisma.uploadedAsset.delete({ where: { id: row.id } }).catch(() => undefined);
      removed += 1;
    }
    if (removed > 0) {
      this.logger.log(`Purged ${removed} orphaned upload(s) older than 24 h`);
    }
  }
}
