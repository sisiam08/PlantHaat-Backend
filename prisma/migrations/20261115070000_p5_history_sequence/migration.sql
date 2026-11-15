-- Additive: stable ordering for append-only history.
ALTER TABLE "SystemSettingHistory" ADD COLUMN "sequence" SERIAL NOT NULL;
CREATE UNIQUE INDEX "SystemSettingHistory_sequence_key" ON "SystemSettingHistory"("sequence");
