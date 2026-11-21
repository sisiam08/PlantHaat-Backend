import { THROTTLER_LIMIT, THROTTLER_TTL } from "@nestjs/throttler/dist/throttler.constants";

import { ComplaintsController } from "../src/modules/complaints/complaints.controller";
import { CheckoutController } from "../src/modules/orders/checkout.controller";
import { PaymentsController } from "../src/modules/payments/payments.controller";
import { UploadsController } from "../src/modules/uploads/uploads.controller";
import { SellerWalletController } from "../src/modules/wallet/seller-wallet.controller";

function metadata(handler: unknown): { limit?: number; ttl?: number } {
  return {
    limit: Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler as object),
    ttl: Reflect.getMetadata(`${THROTTLER_TTL}default`, handler as object),
  };
}

describe("abuse limits on money and upload paths", () => {
  it.each([
    ["payment submission", PaymentsController.prototype.submit, 30],
    ["image upload", UploadsController.prototype.uploadImage, 30],
    ["document upload", UploadsController.prototype.uploadDocument, 10],
    ["withdrawal request", SellerWalletController.prototype.request, 20],
    ["complaint create", ComplaintsController.prototype.create, 20],
    ["checkout", CheckoutController.prototype.checkout, 20],
  ])("%s has a per-minute throttle", (_name, handler, limit) => {
    const { limit: actualLimit, ttl } = metadata(handler);
    expect(actualLimit).toBe(limit);
    expect(ttl).toBe(60_000);
  });
});
