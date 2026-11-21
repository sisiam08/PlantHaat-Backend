-- Additive: delivery proof photos per ShopOrder and seller response photos per complaint comment.
CREATE TABLE "ShopOrderDeliveryProof" (
    "id" TEXT NOT NULL,
    "shopOrderId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopOrderDeliveryProof_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ComplaintCommentAttachment" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplaintCommentAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShopOrderDeliveryProof_shopOrderId_idx" ON "ShopOrderDeliveryProof"("shopOrderId");
CREATE INDEX "ComplaintCommentAttachment_commentId_idx" ON "ComplaintCommentAttachment"("commentId");
ALTER TABLE "ShopOrderDeliveryProof" ADD CONSTRAINT "ShopOrderDeliveryProof_shopOrderId_fkey" FOREIGN KEY ("shopOrderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplaintCommentAttachment" ADD CONSTRAINT "ComplaintCommentAttachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ComplaintComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
