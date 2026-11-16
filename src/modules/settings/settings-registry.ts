export type SettingType = "boolean" | "number" | "string" | "json";

export interface SettingDefinition {
  key: string;
  type: SettingType;
  default: unknown;
  group: "payments" | "orders" | "wallet" | "payouts" | "support" | "platform";
  labelEn: string;
  labelBn: string;
  helpEn?: string;
  helpBn?: string;
  isPublic?: boolean;
  isSensitive?: boolean;
  wired?: boolean;
}

export const SETTINGS_REGISTRY: SettingDefinition[] = [
  { key: "payment.cod.enabled", type: "boolean", default: true, group: "payments", labelEn: "Cash on delivery enabled", labelBn: "ক্যাশ অন ডেলিভারি চালু", isPublic: true, wired: true },
  { key: "payment.advance.enabled", type: "boolean", default: false, group: "payments", labelEn: "Advance payment enabled", labelBn: "অ্যাডভান্স পেমেন্ট চালু", isPublic: true },
  { key: "payment.bkash.enabled", type: "boolean", default: false, group: "payments", labelEn: "bKash enabled", labelBn: "বিকাশ চালু", isPublic: true },
  { key: "payment.bkash.number", type: "string", default: "", group: "payments", labelEn: "bKash receiving number", labelBn: "বিকাশ নম্বর", isSensitive: true },
  { key: "payment.nagad.enabled", type: "boolean", default: false, group: "payments", labelEn: "Nagad enabled", labelBn: "নগদ চালু", isPublic: true },
  { key: "payment.nagad.number", type: "string", default: "", group: "payments", labelEn: "Nagad receiving number", labelBn: "নগদ নম্বর", isSensitive: true },
  { key: "payment.accountNote", type: "string", default: "Personal", group: "payments", labelEn: "Account type note", labelBn: "অ্যাকাউন্টের ধরন" },
  { key: "payment.expiryHours", type: "number", default: 12, group: "payments", labelEn: "Unpaid advance expiry (hours)", labelBn: "অপরিশোধিত মেয়াদ (ঘণ্টা)" },
  { key: "payment.slaHours", type: "number", default: 24, group: "payments", labelEn: "Pending verification SLA (hours)", labelBn: "যাচাইয়ের SLA (ঘণ্টা)" },
  { key: "payment.lateGraceHours", type: "number", default: 48, group: "payments", labelEn: "Late payment grace (hours)", labelBn: "দেরি পেমেন্ট গ্রেস (ঘণ্টা)" },
  { key: "payment.verificationText", type: "string", default: "Verification usually takes a few hours.", group: "payments", labelEn: "Verification time text", labelBn: "যাচাইয়ের সময়" , isPublic: true },
  { key: "order.codMaxAmount", type: "number", default: 0, group: "orders", labelEn: "COD maximum amount (0 = no limit)", labelBn: "COD সর্বোচ্চ (০ = সীমা নেই)", isPublic: true, wired: true },
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
export class SettingValidationError extends Error {
  constructor(
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = "SettingValidationError";
  }
}

const BD_MOBILE = /^01[3-9]\d{8}$/;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function advanceIsLive(): boolean {
  return false;
}

export function validateSettingValue(key: string, value: unknown): void {
  const definition = SETTINGS_REGISTRY.find((setting) => setting.key === key);
  if (!definition) throw new SettingValidationError(`Unknown setting: ${key}`);
  if (definition.type === "boolean" && typeof value !== "boolean") {
    throw new SettingValidationError(`${key} must be a boolean`);
  }
  if (definition.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new SettingValidationError(`${key} must be a finite number`);
  }
  if (definition.type === "string" && typeof value !== "string") {
    throw new SettingValidationError(`${key} must be a string`);
  }
  if (definition.type === "json" && value === undefined) {
    throw new SettingValidationError(`${key} must be JSON`);
  }

  if (typeof value === "number") {
    if (key === "commission.default" && (value < 0 || value > 100)) {
      throw new SettingValidationError("Commission must be between 0 and 100");
    }
    if (key === "payment.expiryHours" && (value < 1 || value > 168)) {
      throw new SettingValidationError("Payment expiry must be 1–168 hours");
    }
    if (key === "payment.slaHours" && (value < 1 || value > 720)) {
      throw new SettingValidationError("Payment SLA must be 1–720 hours");
    }
    if (key === "payment.lateGraceHours" && (value < 0 || value > 720)) {
      throw new SettingValidationError("Late grace must be 0–720 hours");
    }
    if (key === "return.windowHours" && (value < 1 || value > 720)) {
      throw new SettingValidationError("Return window must be 1–720 hours");
    }
    if (key === "payout.cooldownHours" && (value < 0 || value > 720)) {
      throw new SettingValidationError("Payout cooldown must be 0–720 hours");
    }
    if (key === "payout.minimumAmount" && value < 0) {
      throw new SettingValidationError("Minimum withdrawal cannot be negative");
    }
    if (key === "order.codMaxAmount" && value < 0) {
      throw new SettingValidationError("COD maximum cannot be negative");
    }
    if (key === "wallet.codDuesLimit" && value < 0) {
      throw new SettingValidationError("COD dues limit cannot be negative");
    }
  }

  if (
    ["payment.bkash.number", "payment.nagad.number", "support.whatsapp", "support.phone"].includes(
      key,
    ) &&
    typeof value === "string" &&
    value.trim() !== "" &&
    !BD_MOBILE.test(value.trim())
  ) {
    throw new SettingValidationError(`${key} must be a valid Bangladesh mobile number`);
  }
}

export function validateSettingsMap(
  values: Record<string, unknown>,
  current: Record<string, unknown>,
): void {
  const details: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    try {
      validateSettingValue(key, value);
    } catch (error) {
      details[key] = error instanceof Error ? error.message : "Invalid setting";
    }
  }

  const merged = { ...current, ...values };
  const providers = [
    { enabled: "payment.bkash.enabled", number: "payment.bkash.number", label: "bKash" },
    { enabled: "payment.nagad.enabled", number: "payment.nagad.number", label: "Nagad" },
  ];
  const readyProviders = providers.filter((provider) => {
    const number = stringValue(merged[provider.number]);
    return merged[provider.enabled] === true && BD_MOBILE.test(number);
  });
  for (const provider of providers) {
    if (merged[provider.enabled] === true) {
      const number = stringValue(merged[provider.number]);
      if (!BD_MOBILE.test(number)) {
        details[provider.enabled] =
          `${provider.label} cannot be enabled without a valid receiving number`;
      }
    }
  }
  if (merged["payment.advance.enabled"] === true && readyProviders.length === 0) {
    details["payment.advance.enabled"] =
      "Advance payment requires at least one enabled provider with a valid number";
  }
  if (merged["payment.cod.enabled"] === false) {
    const effectiveAdvance =
      advanceIsLive() &&
      merged["payment.advance.enabled"] === true &&
      readyProviders.length > 0;
    if (!effectiveAdvance) {
      details["payment.cod.enabled"] =
        "COD cannot be disabled until Advance payment is live and a provider number is configured";
    }
  }
  if (Object.keys(details).length > 0) {
    throw new SettingValidationError("Some settings are invalid", details);
  }
}

export function publicSettingKeys(): string[] {
  return SETTINGS_REGISTRY.filter((setting) => setting.isPublic).map((setting) => setting.key);
}

export function maskSensitive(values: Record<string, unknown>): Record<string, unknown> {
  const sensitive = new Set(
    SETTINGS_REGISTRY.filter((setting) => setting.isSensitive).map((setting) => setting.key),
  );
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, sensitive.has(key) ? "••••••" : value]),
  );
}
