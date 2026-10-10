export interface SettingSeed {
  key: string;
  value: unknown;
}

export const DEFAULT_SETTINGS: SettingSeed[] = [
  { key: "commission.default", value: 10 },
  { key: "product.autoApprove", value: true },
  { key: "order.sellerConfirmTimeoutHours", value: 48 },
  { key: "complaint.windowHours", value: 48 },
  { key: "review.windowDays", value: 60 },
  { key: "checkout.maxQtyPerItem", value: 20 },
  { key: "payments.online.enabled", value: false },
  { key: "shop.maxPerSeller", value: 1 },
];
