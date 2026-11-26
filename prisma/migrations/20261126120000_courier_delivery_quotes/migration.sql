-- Additive courier delivery-quote model. Existing seller charges/thresholds and
-- historical orders are untouched; `ShopDeliveryZone.charge` stays for history
-- but is no longer used to price a quote.

CREATE TYPE "SteadfastLocationKind" AS ENUM ('DISTRICT', 'DHAKA_CITY', 'DHAKA_SUBURBAN');
CREATE TYPE "DhakaZone" AS ENUM ('CITY', 'SUBURBAN');
CREATE TYPE "ThanaClassificationSource" AS ENUM ('DEFAULT_UNVERIFIED', 'ADMIN_VERIFIED');
CREATE TYPE "CourierQuoteSource" AS ENUM ('LIVE', 'IMPORTED', 'ADMIN');
CREATE TYPE "DeliveryQuoteSource" AS ENUM ('LIVE', 'CACHE', 'STALE', 'OVERRIDE', 'FALLBACK');

ALTER TABLE "District" ADD COLUMN "steadfastLocationId" INTEGER;

CREATE TABLE "SteadfastLocation" (
  "id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "SteadfastLocationKind" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SteadfastLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Thana" (
  "id" TEXT NOT NULL,
  "steadfastPoliceStationId" INTEGER,
  "name" TEXT NOT NULL,
  "nameBn" TEXT,
  "districtId" INTEGER NOT NULL,
  "dhakaZone" "DhakaZone",
  "classificationSource" "ThanaClassificationSource" NOT NULL DEFAULT 'DEFAULT_UNVERIFIED',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Thana_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourierQuoteCache" (
  "id" TEXT NOT NULL,
  "fromSteadfastId" INTEGER NOT NULL,
  "toSteadfastId" INTEGER NOT NULL,
  "weightStep" DECIMAL(6,2) NOT NULL,
  "charge" DECIMAL(10,2),
  "available" BOOLEAN NOT NULL DEFAULT false,
  "lane" TEXT,
  "base" DECIMAL(10,2),
  "weightExtra" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" "CourierQuoteSource" NOT NULL DEFAULT 'LIVE',
  "isOverride" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "CourierQuoteCache_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Address" ADD COLUMN "thanaId" TEXT;
ALTER TABLE "Shop" ADD COLUMN "pickupDistrictId" INTEGER;
ALTER TABLE "Shop" ADD COLUMN "pickupThanaId" TEXT;
ALTER TABLE "Product" ADD COLUMN "weightKg" DECIMAL(7,2);
ALTER TABLE "Product" ADD COLUMN "extraChargeAfterQty" INTEGER;
ALTER TABLE "Product" ADD COLUMN "extraChargePerUnit" DECIMAL(10,2);
ALTER TABLE "ShopDeliveryZone" ADD COLUMN "freeDeliveryEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ShopOrder" ADD COLUMN "courierCharge" DECIMAL(12,2);
ALTER TABLE "ShopOrder" ADD COLUMN "sellerExtraCharge" DECIMAL(12,2);
ALTER TABLE "ShopOrder" ADD COLUMN "parcelWeightKg" DECIMAL(7,2);
ALTER TABLE "ShopOrder" ADD COLUMN "courierLane" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "quoteSource" "DeliveryQuoteSource";
ALTER TABLE "ShopOrder" ADD COLUMN "quoteFetchedAt" TIMESTAMP(3);
ALTER TABLE "ShopOrder" ADD COLUMN "freeDeliveryApplied" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Thana_steadfastPoliceStationId_key" ON "Thana"("steadfastPoliceStationId");
CREATE INDEX "Thana_districtId_idx" ON "Thana"("districtId");
CREATE INDEX "Thana_dhakaZone_idx" ON "Thana"("dhakaZone");
CREATE UNIQUE INDEX "CourierQuoteCache_fromSteadfastId_toSteadfastId_weightStep_key"
  ON "CourierQuoteCache"("fromSteadfastId", "toSteadfastId", "weightStep");
CREATE INDEX "CourierQuoteCache_fromSteadfastId_toSteadfastId_idx"
  ON "CourierQuoteCache"("fromSteadfastId", "toSteadfastId");
CREATE INDEX "CourierQuoteCache_isOverride_idx" ON "CourierQuoteCache"("isOverride");
CREATE INDEX "District_steadfastLocationId_idx" ON "District"("steadfastLocationId");
CREATE INDEX "Address_thanaId_idx" ON "Address"("thanaId");
CREATE INDEX "Shop_pickupDistrictId_idx" ON "Shop"("pickupDistrictId");
CREATE INDEX "Shop_pickupThanaId_idx" ON "Shop"("pickupThanaId");

ALTER TABLE "District" ADD CONSTRAINT "District_steadfastLocationId_fkey"
  FOREIGN KEY ("steadfastLocationId") REFERENCES "SteadfastLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Thana" ADD CONSTRAINT "Thana_districtId_fkey"
  FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Address" ADD CONSTRAINT "Address_thanaId_fkey"
  FOREIGN KEY ("thanaId") REFERENCES "Thana"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_pickupDistrictId_fkey"
  FOREIGN KEY ("pickupDistrictId") REFERENCES "District"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_pickupThanaId_fkey"
  FOREIGN KEY ("pickupThanaId") REFERENCES "Thana"("id") ON DELETE SET NULL ON UPDATE CASCADE;
