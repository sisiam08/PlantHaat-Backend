-- Task 4: product Q&A, threaded replies, unified content reports.
-- Hand-written data migrations preserve existing ReviewReport rows and migrate
-- Review.sellerReply into Reply rows. The hand-managed trigram GIN indexes are
-- intentionally left untouched (they are not in the Prisma datamodel).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('VISIBLE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ContentReportTargetType" AS ENUM ('QUESTION', 'ANSWER', 'REPLY', 'REVIEW');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'QUESTION_ASKED';
ALTER TYPE "NotificationType" ADD VALUE 'QUESTION_ANSWERED';
ALTER TYPE "NotificationType" ADD VALUE 'REPLY_RECEIVED';

-- DropForeignKey
ALTER TABLE "ReviewReport" DROP CONSTRAINT "ReviewReport_reviewId_fkey";

-- CreateTable
CREATE TABLE "ProductQuestion" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isSellerAnswer" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContentStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reply" (
    "id" TEXT NOT NULL,
    "answerId" TEXT,
    "reviewId" TEXT,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isSellerReply" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContentStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentReport" (
    "id" TEXT NOT NULL,
    "targetType" "ContentReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductQuestion_productId_status_createdAt_idx" ON "ProductQuestion"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductQuestion_authorId_productId_createdAt_idx" ON "ProductQuestion"("authorId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "QuestionAnswer_questionId_status_createdAt_idx" ON "QuestionAnswer"("questionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Reply_answerId_status_createdAt_idx" ON "Reply"("answerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Reply_reviewId_status_createdAt_idx" ON "Reply"("reviewId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ContentReport_status_createdAt_idx" ON "ContentReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContentReport_targetType_targetId_idx" ON "ContentReport"("targetType", "targetId");

-- Data migration: existing ReviewReport rows become REVIEW ContentReports.
INSERT INTO "ContentReport" ("id", "targetType", "targetId", "reporterId", "reason", "status", "resolvedById", "resolvedAt", "createdAt")
SELECT "id", 'REVIEW', "reviewId", "reporterId", "reason", "status", "resolvedById", "resolvedAt", "createdAt"
FROM "ReviewReport";

-- AddForeignKey
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ProductQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionAnswer" ADD CONSTRAINT "QuestionAnswer_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "QuestionAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one of answerId/reviewId, and replies never nest.
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_exactly_one_target" CHECK (("answerId" IS NOT NULL) <> ("reviewId" IS NOT NULL));

-- Data migration: legacy Review.sellerReply becomes a seller Reply row.
INSERT INTO "Reply" ("id", "answerId", "reviewId", "authorId", "body", "isSellerReply", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, NULL, r."id", sp."userId", r."sellerReply", true, 'VISIBLE',
       COALESCE(r."sellerRepliedAt", r."updatedAt"), COALESCE(r."sellerRepliedAt", r."updatedAt")
FROM "Review" r
JOIN "Shop" s ON s."id" = r."shopId"
JOIN "SellerProfile" sp ON sp."id" = s."sellerProfileId"
WHERE r."sellerReply" IS NOT NULL;

-- ReviewReport is fully migrated into ContentReport.
DROP TABLE "ReviewReport";
