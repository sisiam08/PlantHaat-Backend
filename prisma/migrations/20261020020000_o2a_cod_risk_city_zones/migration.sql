-- O2a: COD risk profiles + Dhaka city/area delivery scopes.

CREATE TYPE "CodRiskStatus" AS ENUM ('OK', 'WATCH', 'RESTRICTED', 'BLOCKED');
CREATE TYPE "CityScope" AS ENUM ('CITY', 'OUTSIDE', 'NA');
CREATE TYPE "AreaScope" AS ENUM ('ALL', 'CITY', 'OUTSIDE');

-- Existing addresses are unknown scope (NA) and existing zone links cover the
-- whole district (ALL); the defaults below backfill every current row.
ALTER TABLE "Address" ADD COLUMN "cityScope" "CityScope" NOT NULL DEFAULT 'NA';
ALTER TABLE "ZoneDistrict" ADD COLUMN "areaScope" "AreaScope" NOT NULL DEFAULT 'ALL';

CREATE TABLE "PhoneRiskProfile" (
  "id" TEXT NOT NULL,
  "phoneNormalized" TEXT NOT NULL,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "deliveredCount" INTEGER NOT NULL DEFAULT 0,
  "lastEventAt" TIMESTAMP(3),
  "status" "CodRiskStatus" NOT NULL DEFAULT 'OK',
  "note" TEXT,
  "setById" TEXT,
  "isWhitelisted" BOOLEAN NOT NULL DEFAULT false,
  "addressFingerprint" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhoneRiskProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PhoneRiskProfile_phoneNormalized_key" ON "PhoneRiskProfile"("phoneNormalized");
CREATE INDEX "PhoneRiskProfile_status_idx" ON "PhoneRiskProfile"("status");
CREATE INDEX "PhoneRiskProfile_addressFingerprint_idx" ON "PhoneRiskProfile"("addressFingerprint");

ALTER TYPE "NotificationType" ADD VALUE 'COD_RISK_FLAG';
