import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { AppConfigService } from "../../config/app-config.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { STORAGE_SERVICE, type StorageService } from "./storage/storage.types";
import { currentFolderPrefix } from "./upload-references";
import { UploadReferencesService } from "./upload-references.service";

const BATCH_SIZE = 200;
const MIN_GRACE_DAYS = 1;

export interface PurgeSummary {
  dryRun: boolean;
  graceDays: number;
  scanned: number;
  deleted: number;
  wouldDelete: number;
  relinked: number;
  skippedPrivate: number;
  skippedForeignPrefix: number;
}

/**
 * Orphan control: uploads that were never attached to an entity are removed
 * from storage and the tracking table after a configurable grace period.
 * Before deletion every registry column (including JSON) is checked; a live
 * reference relinks the asset instead of deleting it. Private documents and
 * assets outside the current environment folder are never auto-deleted.
 */
@Injectable()
export class UploadsMaintenanceService {
  private readonly logger = new Logger(UploadsMaintenanceService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(UploadReferencesService) private readonly references: UploadReferencesService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeOrphansCron(): Promise<void> {
    await this.purgeOrphans({ dryRun: false });
  }

  async purgeOrphans(options: { dryRun?: boolean } = {}): Promise<PurgeSummary> {
    const dryRun = options.dryRun ?? false;
    const graceDays = Math.max(
      MIN_GRACE_DAYS,
      await this.settings.getNumber("upload.orphanGraceDays"),
    );
    const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);
    const prefix = currentFolderPrefix(this.config.values);
    const usePrefixGuard = this.config.values.STORAGE_DRIVER !== "local";

    const summary: PurgeSummary = {
      dryRun,
      graceDays,
      scanned: 0,
      deleted: 0,
      wouldDelete: 0,
      relinked: 0,
      skippedPrivate: 0,
      skippedForeignPrefix: 0,
    };

    const rows = await this.prisma.uploadedAsset.findMany({
      where: { status: "PENDING", createdAt: { lt: cutoff } },
      take: BATCH_SIZE,
      orderBy: { createdAt: "asc" },
    });

    for (const row of rows) {
      summary.scanned += 1;

      const url = row.url;
      if (!url || row.publicId.includes("/private/")) {
        summary.skippedPrivate += 1;
        continue;
      }

      if (usePrefixGuard && !row.publicId.startsWith(`${prefix}/`)) {
        summary.skippedForeignPrefix += 1;
        continue;
      }

      const reference = await this.references.findReference(url);
      if (reference) {
        summary.relinked += 1;
        if (!dryRun) {
          await this.prisma.uploadedAsset.update({
            where: { id: row.id },
            data: { status: "ATTACHED", attachedAt: new Date() },
          });
        }
        this.logger.log(
          `Relinked upload ${row.publicId} to ${reference.table}.${reference.column}`,
        );
        continue;
      }

      if (dryRun) {
        summary.wouldDelete += 1;
        continue;
      }

      try {
        await this.storage.delete(row.publicId, "public");
      } catch (error) {
        this.logger.warn(
          `Orphan delete failed for ${row.publicId}: ${error instanceof Error ? error.message : "unknown"}`,
        );
        continue;
      }
      await this.prisma.uploadedAsset.delete({ where: { id: row.id } }).catch(() => undefined);
      summary.deleted += 1;
    }

    this.logger.log(
      `Upload orphan sweep${dryRun ? " (dry-run)" : ""}: scanned=${summary.scanned} deleted=${summary.deleted} wouldDelete=${summary.wouldDelete} relinked=${summary.relinked} skippedPrivate=${summary.skippedPrivate} skippedForeignPrefix=${summary.skippedForeignPrefix} graceDays=${summary.graceDays}`,
    );
    return summary;
  }
}
