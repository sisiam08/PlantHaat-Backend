-- Additive: absolute refresh-session lifetime for role-based sliding sessions.
-- Existing sessions keep their current expiry as the absolute cap so no live
-- session is extended by this migration.
ALTER TABLE "RefreshSession" ADD COLUMN IF NOT EXISTS "absoluteExpiresAt" TIMESTAMP(3);

UPDATE "RefreshSession"
SET "absoluteExpiresAt" = "expiresAt"
WHERE "absoluteExpiresAt" IS NULL;
