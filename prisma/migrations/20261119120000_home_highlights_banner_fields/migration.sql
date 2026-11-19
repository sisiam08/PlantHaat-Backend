-- Home Highlights: additive Banner fields and upload dimensions.
-- Rollback: drop the added columns/table fields; no existing rows are rewritten.

ALTER TABLE "Banner"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "imagePublicId" TEXT,
  ADD COLUMN "imageWidth" INTEGER,
  ADD COLUMN "imageHeight" INTEGER,
  ADD COLUMN "mobileImageUrl" TEXT,
  ADD COLUMN "mobileImagePublicId" TEXT,
  ADD COLUMN "mobileImageWidth" INTEGER,
  ADD COLUMN "mobileImageHeight" INTEGER,
  ADD COLUMN "imageAltBn" TEXT,
  ADD COLUMN "imageAltEn" TEXT,
  ADD COLUMN "focalX" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "focalY" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "mobileFocalX" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "mobileFocalY" INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN "overlayEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "headlineBn" TEXT,
  ADD COLUMN "headlineEn" TEXT,
  ADD COLUMN "subtextBn" TEXT,
  ADD COLUMN "subtextEn" TEXT,
  ADD COLUMN "textColor" TEXT,
  ADD COLUMN "scrimColor" TEXT DEFAULT '#0B2116',
  ADD COLUMN "scrimOpacity" INTEGER NOT NULL DEFAULT 35,
  ADD COLUMN "desktopPosition" TEXT DEFAULT 'BOTTOM_LEFT',
  ADD COLUMN "mobilePosition" TEXT DEFAULT 'BOTTOM_LEFT',
  ADD COLUMN "desktopAlign" TEXT DEFAULT 'left',
  ADD COLUMN "mobileAlign" TEXT DEFAULT 'left',
  ADD COLUMN "buttonEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "buttonLabelBn" TEXT,
  ADD COLUMN "buttonLabelEn" TEXT,
  ADD COLUMN "buttonHref" TEXT,
  ADD COLUMN "buttonStyle" TEXT DEFAULT 'primary',
  ADD COLUMN "buttonBgColor" TEXT,
  ADD COLUMN "buttonTextColor" TEXT,
  ADD COLUMN "openInNewTab" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "updatedById" TEXT;

ALTER TABLE "UploadedAsset"
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER;
