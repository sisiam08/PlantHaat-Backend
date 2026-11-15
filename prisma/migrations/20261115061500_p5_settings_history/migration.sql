-- Additive only: settings change history. No existing data rewritten.
CREATE TABLE "SystemSettingHistory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "oldValue" JSONB,
  "newValue" JSONB,
  "updatedById" TEXT,
  "reason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemSettingHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SystemSettingHistory_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "SystemSettingHistory_key_createdAt_idx" ON "SystemSettingHistory"("key", "createdAt");
CREATE INDEX "SystemSettingHistory_updatedById_idx" ON "SystemSettingHistory"("updatedById");
