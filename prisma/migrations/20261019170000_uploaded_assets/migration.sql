-- Task U: orphan control for uploaded assets (Cloudinary/local).
CREATE TYPE "UploadAssetStatus" AS ENUM ('PENDING', 'ATTACHED');

CREATE TABLE "UploadedAsset" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL DEFAULT 'image',
    "url" TEXT,
    "purpose" TEXT NOT NULL,
    "ownerId" TEXT,
    "status" "UploadAssetStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachedAt" TIMESTAMP(3),

    CONSTRAINT "UploadedAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UploadedAsset_status_createdAt_idx" ON "UploadedAsset"("status", "createdAt");
CREATE INDEX "UploadedAsset_ownerId_idx" ON "UploadedAsset"("ownerId");
