/**
 * Central registry of every database column that can hold an uploaded asset URL
 * or key. The orphan cron and reconciliation scripts must use this registry so a
 * new URL-bearing column cannot be forgotten.
 *
 * `model` is the Prisma client property (camelCase); `table`/`column` are the
 * physical PostgreSQL identifiers used by the JSON text search.
 */
export interface UploadReference {
  model: string;
  table: string;
  column: string;
}

/** Public URL columns: exact string match. */
export const UPLOAD_SCALAR_REFERENCES: readonly UploadReference[] = [
  { model: "user", table: "User", column: "avatarUrl" },
  { model: "shop", table: "Shop", column: "logoUrl" },
  { model: "shop", table: "Shop", column: "bannerUrl" },
  { model: "category", table: "Category", column: "imageUrl" },
  { model: "productImage", table: "ProductImage", column: "url" },
  { model: "shopOrder", table: "ShopOrder", column: "deliveryProofUrl" },
  { model: "shopOrderDeliveryProof", table: "ShopOrderDeliveryProof", column: "url" },
  { model: "complaintCommentAttachment", table: "ComplaintCommentAttachment", column: "url" },
  { model: "orderItem", table: "OrderItem", column: "imageUrl" },
  { model: "paymentSubmission", table: "PaymentSubmission", column: "proofUrl" },
  { model: "reviewImage", table: "ReviewImage", column: "url" },
  { model: "complaintAttachment", table: "ComplaintAttachment", column: "url" },
  { model: "message", table: "Message", column: "attachmentUrl" },
  { model: "banner", table: "Banner", column: "imageUrl" },
  { model: "banner", table: "Banner", column: "mobileImageUrl" },
] as const;

/** JSON columns: any string value containing the URL counts as a reference. */
export const UPLOAD_JSON_REFERENCES: readonly UploadReference[] = [
  { model: "user", table: "User", column: "notificationPrefs" },
  { model: "product", table: "Product", column: "careDetails" },
  { model: "payment", table: "Payment", column: "providerPayload" },
  { model: "paymentIntent", table: "PaymentIntent", column: "providerSnapshot" },
  { model: "paymentWebhookEvent", table: "PaymentWebhookEvent", column: "payload" },
  { model: "notification", table: "Notification", column: "data" },
  { model: "auditLog", table: "AuditLog", column: "before" },
  { model: "auditLog", table: "AuditLog", column: "after" },
  { model: "homepageSection", table: "HomepageSection", column: "config" },
  { model: "systemSetting", table: "SystemSetting", column: "value" },
  { model: "systemSettingHistory", table: "SystemSettingHistory", column: "oldValue" },
  { model: "systemSettingHistory", table: "SystemSettingHistory", column: "newValue" },
] as const;

/** Private document keys: never auto-deleted; listed for admin review only. */
export const UPLOAD_PRIVATE_REFERENCES: readonly UploadReference[] = [
  { model: "sellerDocument", table: "SellerDocument", column: "fileKey" },
] as const;

/** Self-tracking table is intentionally excluded from reference lookups. */
export const UPLOAD_SELF_TABLE = "UploadedAsset";

/** Exact URL-like column names that must be registered (or explicitly excluded). */
export const URL_LIKE_COLUMNS = new Set([
  "avatarurl",
  "logourl",
  "bannerurl",
  "imageurl",
  "mobileimageurl",
  "url",
  "deliveryproofurl",
  "proofurl",
  "attachmenturl",
  "filekey",
]);

/** URL-like columns that are not uploaded-asset references. */
export const NON_UPLOAD_URL_COLUMNS = new Set([
  "UploadedAsset.url",
  "Banner.linkUrl",
  "Refund.reference",
  "Payout.reference",
  "Payment.providerTxnId",
  "RefundObligation.refundTrxId",
]);

export function currentFolderPrefix(env: {
  CLOUDINARY_FOLDER?: string;
  CLOUDINARY_FOLDER_PREFIX?: string;
  NODE_ENV: string;
}): string {
  return (
    env.CLOUDINARY_FOLDER ??
    env.CLOUDINARY_FOLDER_PREFIX ??
    `planthaat/${env.NODE_ENV}`
  ).replace(/^\/+|\/+$/g, "");
}
