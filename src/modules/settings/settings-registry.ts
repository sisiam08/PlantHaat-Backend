export type SettingType = "boolean" | "number" | "string" | "json";

export interface SettingDefinition {
  key: string;
  type: SettingType;
  default: unknown;
  group: "payments" | "orders" | "wallet" | "payouts" | "support" | "platform";
  labelEn: string;
  labelBn: string;
  isPublic?: boolean;
  isSensitive?: boolean;
}

export const SETTINGS_REGISTRY: SettingDefinition[] = [
  { key: "payment.cod.enabled", type: "boolean", default: true, group: "payments", labelEn: "Cash on delivery enabled", labelBn: "ক্যাশ অন ডেলিভারি চালু", isPublic: true },
  { key: "payment.advance.enabled", type: "boolean", default: false, group: "payments", labelEn: "Advance payment enabled", labelBn: "অ্যাডভান্স পেমেন্ট চালু", isPublic: true },
  { key: "payment.bkash.enabled", type: "boolean", default: true, group: "payments", labelEn: "bKash enabled", labelBn: "বিকাশ চালু", isPublic: true },
  { key: "payment.bkash.number", type: "string", default: "", group: "payments", labelEn: "bKash receiving number", labelBn: "বিকাশ নম্বর", isSensitive: true },
  { key: "payment.nagad.enabled", type: "boolean", default: true, group: "payments", labelEn: "Nagad enabled", labelBn: "নগদ চালু", isPublic: true },
  { key: "payment.nagad.number", type: "string", default: "", group: "payments", labelEn: "Nagad receiving number", labelBn: "নগদ নম্বর", isSensitive: true },
  { key: "payment.accountNote", type: "string", default: "Personal", group: "payments", labelEn: "Account type note", labelBn: "অ্যাকাউন্টের ধরন" },
  { key: "payment.expiryHours", type: "number", default: 12, group: "payments", labelEn: "Unpaid advance expiry (hours)", labelBn: "অপরিশোধিত মেয়াদ (ঘণ্টা)" },
  { key: "payment.slaHours", type: "number", default: 24, group: "payments", labelEn: "Pending verification SLA (hours)", labelBn: "যাচাইয়ের SLA (ঘণ্টা)" },
  { key: "payment.lateGraceHours", type: "number", default: 48, group: "payments", labelEn: "Late payment grace (hours)", labelBn: "দেরি পেমেন্ট গ্রেস (ঘণ্টা)" },
  { key: "payment.verificationText", type: "string", default: "Verification usually takes a few hours.", group: "payments", labelEn: "Verification time text", labelBn: "যাচাইয়ের সময়" , isPublic: true },
  { key: "order.codMaxAmount", type: "number", default: 0, group: "orders", labelEn: "COD maximum amount (0 = no limit)", labelBn: "COD সর্বোচ্চ (০ = সীমা নেই)", isPublic: true },
  { key: "return.windowHours", type: "number", default: 48, group: "orders", labelEn: "Return/objection window (hours)", labelBn: "ফেরতের সময় (ঘণ্টা)", isPublic: true },
  { key: "return.earlyRelease", type: "boolean", default: true, group: "orders", labelEn: "Allow early release confirmation", labelBn: "আগে রিলিজ নিশ্চিতকরণ" , isPublic: true },
  { key: "return.photoRequired", type: "boolean", default: true, group: "orders", labelEn: "Photo required for disputes", labelBn: "বিরোধে ছবি আবশ্যক" , isPublic: true },
  { key: "commission.default", type: "number", default: 10, group: "wallet", labelEn: "Default commission (%)", labelBn: "ডিফল্ট কমিশন (%)" , isSensitive: true },
  { key: "wallet.deliveryChargeRecipient", type: "string", default: "seller", group: "wallet", labelEn: "Delivery charge recipient", labelBn: "ডেলিভারি চার্জ প্রাপক", isSensitive: true },
  { key: "wallet.codDuesLimit", type: "number", default: 1000, group: "wallet", labelEn: "COD dues limit", labelBn: "COD বকেয়া সীমা", isSensitive: true },
  { key: "wallet.codCommissionDeduct", type: "boolean", default: true, group: "wallet", labelEn: "Deduct COD commission from available", labelBn: "COD কমিশন কাটা হবে", isSensitive: true },
  { key: "payout.minimumAmount", type: "number", default: 500, group: "payouts", labelEn: "Minimum withdrawal", labelBn: "সর্বনিম্ন উত্তোলন", isSensitive: true },
  { key: "payout.methods", type: "json", default: ["BKASH", "NAGAD", "BANK"], group: "payouts", labelEn: "Allowed payout methods", labelBn: "পেআউট পদ্ধতি", isSensitive: true },
  { key: "payout.cooldownHours", type: "number", default: 24, group: "payouts", labelEn: "Payout profile cooldown (hours)", labelBn: "প্রোফাইল কুলডাউন (ঘণ্টা)", isSensitive: true },
  { key: "payout.maxPendingRequests", type: "number", default: 3, group: "payouts", labelEn: "Maximum pending withdrawals", labelBn: "সর্বোচ্চ অপেক্ষমাণ উইথড্র", isSensitive: true },
  { key: "payout.processingText", type: "string", default: "Payouts are processed within 2 business days.", group: "payouts", labelEn: "Payout processing text", labelBn: "পেআউট প্রসেসিং বার্তা", isPublic: true },
  { key: "support.whatsapp", type: "string", default: "", group: "support", labelEn: "WhatsApp number", labelBn: "হোয়াটসঅ্যাপ নম্বর", isPublic: true },
  { key: "support.phone", type: "string", default: "", group: "support", labelEn: "Support phone", labelBn: "সাপোর্ট ফোন", isPublic: true },
  { key: "support.email", type: "string", default: "", group: "support", labelEn: "Support email", labelBn: "সাপোর্ট ইমেইল", isPublic: true },
];

export const SETTING_DEFAULTS = Object.fromEntries(
  SETTINGS_REGISTRY.map((setting) => [setting.key, setting.default]),
);
