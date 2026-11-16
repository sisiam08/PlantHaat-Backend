-- Additive: groups history rows written by one admin save.
ALTER TABLE "SystemSettingHistory" ADD COLUMN "batchId" TEXT;
CREATE INDEX "SystemSettingHistory_batchId_idx" ON "SystemSettingHistory"("batchId");

-- Rollback:
-- DROP INDEX "SystemSettingHistory_batchId_idx";
-- ALTER TABLE "SystemSettingHistory" DROP COLUMN "batchId";
