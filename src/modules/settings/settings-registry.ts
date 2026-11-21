export type SettingType = "boolean" | "number" | "string" | "json";

export interface SettingDefinition {
  key: string;
  type: SettingType;
  default: unknown;
  group:
    | "payments"
    | "orders"
    | "wallet"
    | "payouts"
    | "support"
    | "platform"
    | "security"
    | "home";
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
  { key: "payment.advance.enabled", type: "boolean", default: false, group: "payments", labelEn: "Advance payment enabled", labelBn: "অ্যাডভান্স পেমেন্ট চালু", isPublic: true, wired: true },
  { key: "payment.bkash.enabled", type: "boolean", default: false, group: "payments", labelEn: "bKash enabled", labelBn: "বিকাশ চালু", isPublic: true, wired: true },
  { key: "payment.bkash.number", type: "string", default: "", group: "payments", labelEn: "bKash receiving number", labelBn: "বিকাশ নম্বর", isSensitive: true, wired: true },
  { key: "payment.nagad.enabled", type: "boolean", default: false, group: "payments", labelEn: "Nagad enabled", labelBn: "নগদ চালু", isPublic: true, wired: true },
  { key: "payment.nagad.number", type: "string", default: "", group: "payments", labelEn: "Nagad receiving number", labelBn: "নগদ নম্বর", isSensitive: true, wired: true },
  { key: "payment.instructions", type: "string", default: "Send the exact order total to the number shown and submit the transaction ID.", group: "payments", labelEn: "Payment instructions", labelBn: "পেমেন্ট নির্দেশনা", isPublic: true, wired: true },
  { key: "payment.warningText", type: "string", default: "Send from your own number and keep the receipt until the order is verified.", group: "payments", labelEn: "Payment warning", labelBn: "পেমেন্ট সতর্কতা", isPublic: true, wired: true },
  { key: "payment.accountNote", type: "string", default: "Personal", group: "payments", labelEn: "Account type note", labelBn: "অ্যাকাউন্টের ধরন", wired: true },
  { key: "payment.expiryHours", type: "number", default: 12, group: "payments", labelEn: "Unpaid advance expiry (hours)", labelBn: "অপরিশোধিত মেয়াদ (ঘণ্টা)", wired: true },
  { key: "payment.slaHours", type: "number", default: 24, group: "payments", labelEn: "Pending verification SLA (hours)", labelBn: "যাচাইয়ের SLA (ঘণ্টা)", wired: true },
  { key: "payment.lateGraceHours", type: "number", default: 48, group: "payments", labelEn: "Late payment grace (hours)", labelBn: "দেরি পেমেন্ট গ্রেস (ঘণ্টা)", wired: true },
  { key: "payment.verificationText", type: "string", default: "Verification usually takes a few hours.", group: "payments", labelEn: "Verification time text", labelBn: "যাচাইয়ের সময়" , isPublic: true, wired: true },
  { key: "order.codMaxAmount", type: "number", default: 0, group: "orders", labelEn: "COD maximum amount (0 = no limit)", labelBn: "COD সর্বোচ্চ (০ = সীমা নেই)", isPublic: true, wired: true },
  { key: "return.windowHours", type: "number", default: 48, group: "orders", labelEn: "Return/objection window (hours)", labelBn: "ফেরতের সময় (ঘণ্টা)", isPublic: true, wired: true },
  { key: "return.earlyRelease", type: "boolean", default: true, group: "orders", labelEn: "Allow early release confirmation", labelBn: "আগে রিলিজ নিশ্চিতকরণ" , isPublic: true, wired: true },
  { key: "return.photoRequired", type: "boolean", default: true, group: "orders", labelEn: "Photo required for disputes", labelBn: "বিরোধে ছবি আবশ্যক" , isPublic: true, wired: true },
  { key: "return.maxEvidencePhotos", type: "number", default: 5, group: "orders", labelEn: "Maximum dispute photos", labelBn: "বিরোধে সর্বোচ্চ ছবি" , wired: true },
  { key: "order.deliveryProofRequired", type: "boolean", default: false, group: "orders", labelEn: "Require delivery proof photo", labelBn: "???????? ???????? ??? ???????????", helpEn: "When on, a seller must attach 1-3 photos before marking an order DELIVERED.", helpBn: "???? ????? ?????? DELIVERED ???? ??? ?????????? 1-3?? ??? ??????? ???? ????", wired: true },
  { key: "return.disputeSellerHours", type: "number", default: 48, group: "orders", labelEn: "Seller dispute response window (hours)", labelBn: "বিক্রেতার জবাবের সময় (ঘণ্টা)" , wired: true },
  { key: "commission.default", type: "number", default: 10, group: "wallet", labelEn: "Default commission (%)", labelBn: "ডিফল্ট কমিশন (%)" , isSensitive: true },
  { key: "wallet.deliveryChargeRecipient", type: "string", default: "seller", group: "wallet", labelEn: "Delivery charge recipient", labelBn: "ডেলিভারি চার্জ প্রাপক", isSensitive: true },
  { key: "wallet.codDuesLimit", type: "number", default: 1000, group: "wallet", labelEn: "COD dues limit", labelBn: "COD বকেয়া সীমা", isSensitive: true, wired: true },
  { key: "wallet.codCommissionDeduct", type: "boolean", default: true, group: "wallet", labelEn: "Deduct COD commission from available", labelBn: "COD কমিশন কাটা হবে", isSensitive: true, wired: true },
  { key: "payout.minimumAmount", type: "number", default: 500, group: "payouts", labelEn: "Minimum withdrawal", labelBn: "সর্বনিম্ন উত্তোলন", isSensitive: true, wired: true },
  { key: "payout.methods", type: "json", default: ["BKASH", "NAGAD", "BANK"], group: "payouts", labelEn: "Allowed payout methods", labelBn: "পেআউট পদ্ধতি", isSensitive: true, wired: true },
  { key: "payout.cooldownHours", type: "number", default: 24, group: "payouts", labelEn: "Payout profile cooldown (hours)", labelBn: "প্রোফাইল কুলডাউন (ঘণ্টা)", isSensitive: true, wired: true },
  { key: "payout.maxPendingRequests", type: "number", default: 3, group: "payouts", labelEn: "Maximum pending withdrawals", labelBn: "সর্বোচ্চ অপেক্ষমাণ উইথড্র", isSensitive: true, wired: true },
  { key: "payout.processingText", type: "string", default: "Payouts are processed within 2 business days.", group: "payouts", labelEn: "Payout processing text", labelBn: "পেআউট প্রসেসিং বার্তা", isPublic: true },
  { key: "checkout.maxQtyPerItem", type: "number", default: 20, group: "orders", labelEn: "Max quantity per item", labelBn: "Max quantity per item", wired: true },
  { key: "order.sellerConfirmTimeoutHours", type: "number", default: 48, group: "orders", labelEn: "Seller confirm timeout (hours)", labelBn: "Seller confirm timeout (hours)", wired: true },
  { key: "review.windowDays", type: "number", default: 14, group: "orders", labelEn: "Review window (days)", labelBn: "Review window (days)", wired: true },
  { key: "product.autoApprove", type: "boolean", default: true, group: "orders", labelEn: "Auto-approve products", labelBn: "Auto-approve products", wired: true },
  { key: "payout.holdHours", type: "number", default: 48, group: "payouts", labelEn: "Payout hold (hours, retired)", labelBn: "????? ????? (?????, ?????)", helpEn: "Deprecated alias of return.windowHours. Edit the single hold in Settings ? Orders.", helpBn: "return.windowHours-?? ????? ?????? ??? ??????? Settings ? Orders-? ???????? ?????", wired: false },
  { key: "codRisk.watchAfter", type: "number", default: 2, group: "orders", labelEn: "COD risk watch after failures", labelBn: "COD risk watch after failures", wired: true },
  { key: "codRisk.blockAfter", type: "number", default: 4, group: "orders", labelEn: "COD risk block after failures", labelBn: "COD risk block after failures", wired: true },
  { key: "codRisk.windowDays", type: "number", default: 90, group: "orders", labelEn: "COD risk window (days)", labelBn: "COD risk window (days)", wired: true },
  { key: "codRisk.restrictCap", type: "number", default: 2000, group: "orders", labelEn: "COD restricted cap", labelBn: "COD restricted cap", wired: true },
  { key: "stuck.confirmedHours", type: "number", default: 48, group: "orders", labelEn: "Stuck CONFIRMED hours", labelBn: "Stuck CONFIRMED hours", wired: true },
  { key: "stuck.packedHours", type: "number", default: 48, group: "orders", labelEn: "Stuck PACKED hours", labelBn: "Stuck PACKED hours", wired: true },
  { key: "stuck.shippedGraceDays", type: "number", default: 2, group: "orders", labelEn: "Stuck SHIPPED grace days", labelBn: "Stuck SHIPPED grace days", wired: true },
  { key: "stuck.reminderHours", type: "number", default: 24, group: "orders", labelEn: "Stuck reminder hours", labelBn: "Stuck reminder hours", wired: true },
  { key: "stuck.maxReminders", type: "number", default: 3, group: "orders", labelEn: "Stuck max reminders", labelBn: "Stuck max reminders", wired: true },
  { key: "upload.orphanGraceDays", type: "number", default: 7, group: "platform", labelEn: "Orphan upload grace (days)", labelBn: "অনাথ আপলোড গ্রেস (দিন)", helpEn: "Pending uploads older than this are checked for references before deletion. Minimum 1 day.", helpBn: "এই সময়ের বেশি পুরোনো pending upload মুছে ফেলার আগে reference যাচাই করা হয়। সর্বনিম্ন ১ দিন।", wired: true },
  { key: "support.whatsapp", type: "string", default: "", group: "support", labelEn: "WhatsApp number", labelBn: "হোয়াটসঅ্যাপ নম্বর", isPublic: true },
  { key: "support.phone", type: "string", default: "", group: "support", labelEn: "Support phone", labelBn: "সাপোর্ট ফোন", isPublic: true },
  { key: "support.email", type: "string", default: "", group: "support", labelEn: "Support email", labelBn: "সাপোর্ট ইমেইল", isPublic: true },
  { key: "security.access.ttlMinutes", type: "number", default: 15, group: "security", labelEn: "Access token lifetime (minutes)", labelBn: "অ্যাক্সেস টোকেনের আয়ুষ্কাল (মিনিট)", helpEn: "The short-lived JWT is renewed automatically. This does not log users out; it only sets how often a refresh happens.", helpBn: "স্বল্পস্থায়ী JWT স্বয়ংক্রিয়ভাবে নবায়ন হয়। এটি কাউকে লগআউট করে না; শুধু কত ঘন ঘন রিফ্রেশ হবে তা ঠিক করে।", wired: true },
  { key: "security.refresh.customer.days", type: "number", default: 30, group: "security", labelEn: "Customer session lifetime (days, sliding)", labelBn: "ক্রেতার সেশনের আয়ুষ্কাল (দিন, স্লাইডিং)", helpEn: "A session extends while it is used, up to the maximum below. This is also the cookie lifetime.", helpBn: "ব্যবহারের সাথে সেশন বাড়ে, নিচের সর্বোচ্চ সীমা পর্যন্ত। কুকির আয়ুষ্কালও এটিই।", wired: true },
  { key: "security.refresh.customer.maxDays", type: "number", default: 90, group: "security", labelEn: "Customer maximum session lifetime (days, absolute)", labelBn: "ক্রেতার সর্বোচ্চ সেশন আয়ুষ্কাল (দিন, চূড়ান্ত)", helpEn: "Hard cap from sign-in; refreshing cannot extend the session past this.", helpBn: "লগইনের পর থেকে চূড়ান্ত সীমা; রিফ্রেশ করেও এর বেশি বাড়ানো যায় না।", wired: true },
  { key: "security.refresh.seller.days", type: "number", default: 14, group: "security", labelEn: "Seller session lifetime (days, sliding)", labelBn: "বিক্রেতার সেশনের আয়ুষ্কাল (দিন, স্লাইডিং)", helpEn: "A session extends while it is used, up to the maximum below.", helpBn: "ব্যবহারের সাথে সেশন বাড়ে, নিচের সর্বোচ্চ সীমা পর্যন্ত।", wired: true },
  { key: "security.refresh.seller.maxDays", type: "number", default: 60, group: "security", labelEn: "Seller maximum session lifetime (days, absolute)", labelBn: "বিক্রেতার সর্বোচ্চ সেশন আয়ুষ্কাল (দিন, চূড়ান্ত)", helpEn: "Hard cap from sign-in; refreshing cannot extend the session past this.", helpBn: "লগইনের পর থেকে চূড়ান্ত সীমা; রিফ্রেশ করেও এর বেশি বাড়ানো যায় না।", wired: true },
  { key: "security.refresh.admin.days", type: "number", default: 7, group: "security", labelEn: "Admin session lifetime (days, sliding)", labelBn: "অ্যাডমিন সেশনের আয়ুষ্কাল (দিন, স্লাইডিং)", helpEn: "A session extends while it is used, up to the maximum below.", helpBn: "ব্যবহারের সাথে সেশন বাড়ে, নিচের সর্বোচ্চ সীমা পর্যন্ত।", wired: true },
  { key: "security.refresh.admin.maxDays", type: "number", default: 30, group: "security", labelEn: "Admin maximum session lifetime (days, absolute)", labelBn: "অ্যাডমিন সর্বোচ্চ সেশন আয়ুষ্কাল (দিন, চূড়ান্ত)", helpEn: "Hard cap from sign-in; refreshing cannot extend the session past this.", helpBn: "লগইনের পর থেকে চূড়ান্ত সীমা; রিফ্রেশ করেও এর বেশি বাড়ানো যায় না।", wired: true },
  { key: "security.refresh.graceSeconds", type: "number", default: 30, group: "security", labelEn: "Refresh reuse grace window (seconds)", labelBn: "রিফ্রেশ পুনর্ব্যবহারের গ্রেস উইন্ডো (সেকেন্ড)", helpEn: "Parallel refreshes inside this window are treated as benign, not as token reuse.", helpBn: "এই সময়ের মধ্যে সমান্তরাল রিফ্রেশকে টোকেন পুনর্ব্যবহার ধরা হয় না।", wired: true },
  { key: "home.hero.headline", type: "json", default: { bn: "আপনার ঘর সবুজে ভরে তুলুন", en: "Fill your home with green" }, group: "home", labelEn: "Hero headline", labelBn: "হিরো শিরোনাম", helpEn: "Shown in the home hero. Keep it short; customers scan it in about five seconds.", helpBn: "হোম হিরোতে দেখানো হয়। সংক্ষিপ্ত রাখুন; ক্রেতারা প্রায় পাঁচ সেকেন্ডে এটি দেখে নেন।", isPublic: true, wired: true },
  { key: "home.hero.subheadline", type: "json", default: { bn: "সারা বাংলাদেশে যাচাইকৃত নার্সারির গাছ - ক্যাশ অন ডেলিভারি, নিরাপদ প্যাকেজিং।", en: "Plants from verified nurseries across Bangladesh - cash on delivery, plant-safe packaging." }, group: "home", labelEn: "Hero subheadline", labelBn: "হিরো উপ-শিরোনাম", helpEn: "One line of context under the headline.", helpBn: "শিরোনামের নিচে এক লাইনের পরিচিতি।", isPublic: true, wired: true },
  { key: "home.hero.chips", type: "json", default: [
    { labelBn: "ইন্ডোর", labelEn: "Indoor", href: "/products?isIndoor=true" },
    { labelBn: "কম আলো", labelEn: "Low light", href: "/products?light=LOW_LIGHT" },
    { labelBn: "পোষা প্রাণীর জন্য নিরাপদ", labelEn: "Pet-safe", href: "/products?isPetSafe=true" },
    { labelBn: "৳500-এর নিচে", labelEn: "Under ৳500", href: "/products?maxPrice=500" },
    { labelBn: "বীজ", labelEn: "Seeds", href: "/products?category=seeds" },
    { labelBn: "টব ও প্ল্যান্টার", labelEn: "Pots", href: "/products?category=pots-planters" },
    { labelBn: "গার্ডেনিং টুলস", labelEn: "Tools", href: "/products?category=gardening-tools" },
  ], group: "home", labelEn: "Popular search chips", labelBn: "জনপ্রিয় সার্চ চিপ", helpEn: "Deprecated: the marketplace chip row was removed from the hero. Kept for settings history only.", helpBn: "অপ্রচলিত: মার্কেটপ্লেস চিপ সারি হিরো থেকে সরানো হয়েছে। শুধু সেটিংস ইতিহাসের জন্য রাখা হয়েছে।", isPublic: false, wired: false },
  { key: "home.hero.image", type: "json", default: { url: "", mobileUrl: "", altBn: "", altEn: "", focalX: 50, focalY: 50 }, group: "home", labelEn: "Hero image", labelBn: "হিরো ছবি", helpEn: "Optional. When set, this image replaces the plant scene on the right (static, no WebGL).", helpBn: "ঐচ্ছিক। দিলে ডান পাশের উদ্ভিদ দৃশ্যের বদলে এই ছবি দেখানো হবে (স্থির, WebGL ছাড়া)।", isPublic: true, wired: true },
  { key: "home.highlights.enabled", type: "boolean", default: true, group: "home", labelEn: "Highlights section on home", labelBn: "হোমে হাইলাইট সেকশন", helpEn: "When off, the Highlights section, its heading and its spacing do not appear on the home page.", helpBn: "বন্ধ থাকলে হোম পেজে হাইলাইট সেকশন, শিরোনাম ও ফাঁকা জায়গা কিছুই দেখাবে না।", isPublic: true, wired: true },
  { key: "home.highlights.autoplay", type: "boolean", default: false, group: "home", labelEn: "Highlights autoplay", labelBn: "হাইলাইট অটোপ্লে", helpEn: "Off by default. When on, it runs only on tablet/desktop, pauses on hover, focus and touch, and never ignores reduced motion.", helpBn: "ডিফল্ট বন্ধ। চালু থাকলে শুধু ট্যাবলেট/ডেস্কটপে চলবে, হোভার/ফোকাস/টাচে থামবে এবং reduced motion উপেক্ষা করবে না।", isPublic: true, wired: true },
  { key: "home.highlights.intervalSeconds", type: "number", default: 6, group: "home", labelEn: "Highlights interval (seconds)", labelBn: "হাইলাইট বিরতি (সেকেন্ড)", helpEn: "4-12 seconds. Autoplay is ignored when the customer prefers reduced motion.", helpBn: "৪-১২ সেকেন্ড। ক্রেতা reduced motion পছন্দ করলে অটোপ্লে চলবে না।", isPublic: true, wired: true },
  { key: "home.highlights.maxSlides", type: "number", default: 6, group: "home", labelEn: "Maximum active highlights", labelBn: "সর্বোচ্চ সক্রিয় হাইলাইট", helpEn: "1-10. Extra active slides stay in the admin list but are not sent to the home page.", helpBn: "১-১০। অতিরিক্ত সক্রিয় স্লাইড অ্যাডমিন তালিকায় থাকবে কিন্তু হোম পেজে যাবে না।", wired: true },
  { key: "home.highlights.title", type: "json", default: { bn: "হাইলাইট", en: "Highlights" }, group: "home", labelEn: "Highlights section title", labelBn: "হাইলাইট সেকশনের শিরোনাম", helpEn: "Leave both languages empty to hide the section heading.", helpBn: "শিরোনাম লুকাতে দুই ভাষাই খালি রাখুন।", isPublic: true, wired: true },
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Same-site relative path or an absolute https URL. Blocks javascript:, data:, //host and other schemes. */
export function isSafePublicLink(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const href = value.trim();
  if (href === "") return false;
  if (href.startsWith("//")) return false;
  if (href.startsWith("/")) return true;
  return /^https:\/\/[^\s]+$/i.test(href);
}

function localizedText(value: unknown, field: string, maxLength: number, allowEmpty = false): void {
  if (!isRecord(value)) {
    throw new SettingValidationError(`${field} must have bn and en text`);
  }
  for (const locale of ["bn", "en"] as const) {
    const text = value[locale];
    if (typeof text !== "string") {
      throw new SettingValidationError(`${field}.${locale} must be text`);
    }
    if (!allowEmpty && text.trim().length === 0) {
      throw new SettingValidationError(`${field}.${locale} cannot be empty`);
    }
    if (text.length > maxLength) {
      throw new SettingValidationError(`${field}.${locale} must be ${maxLength} characters or fewer`);
    }
  }
}

export interface HeroChipValue {
  labelBn: string;
  labelEn: string;
  href: string;
}

function advanceIsLive(): boolean {
  return true;
}

export function effectiveAdvanceFrom(values: Record<string, unknown>): boolean {
  if (!advanceIsLive() || values["payment.advance.enabled"] !== true) return false;
  return [
    ["payment.bkash.enabled", "payment.bkash.number"],
    ["payment.nagad.enabled", "payment.nagad.number"],
  ].some(([enabled, number]) => values[enabled] === true && BD_MOBILE.test(stringValue(values[number])));
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
    if (key === "return.maxEvidencePhotos" && (value < 1 || value > 20)) {
      throw new SettingValidationError("Dispute photos must be 1–20");
    }
    if (key === "return.disputeSellerHours" && (value < 1 || value > 720)) {
      throw new SettingValidationError("Seller response window must be 1–720 hours");
    }
    if (key === "payout.maxPendingRequests" && (value < 0 || value > 20)) {
      throw new SettingValidationError("Pending withdrawal limit must be 0–20");
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
    if (key === "security.access.ttlMinutes" && (value < 1 || value > 1440)) {
      throw new SettingValidationError("Access token lifetime must be 1-1440 minutes");
    }
    if (
      ["security.refresh.customer.days", "security.refresh.seller.days", "security.refresh.admin.days"].includes(
        key,
      ) &&
      (value < 1 || value > 365)
    ) {
      throw new SettingValidationError("Session lifetime must be between 1 and 365 days");
    }
    if (
      [
        "security.refresh.customer.maxDays",
        "security.refresh.seller.maxDays",
        "security.refresh.admin.maxDays",
      ].includes(key) &&
      (value < 1 || value > 730)
    ) {
      throw new SettingValidationError("Maximum session lifetime must be between 1 and 730 days");
    }
    if (key === "security.refresh.graceSeconds" && (value < 0 || value > 300)) {
      throw new SettingValidationError("Refresh grace window must be 0-300 seconds");
    }
    if (key === "upload.orphanGraceDays" && (value < 1 || value > 30)) {
      throw new SettingValidationError("Orphan upload grace must be 1–30 days");
    }
    if (key === "home.highlights.intervalSeconds" && (value < 4 || value > 12)) {
      throw new SettingValidationError("Highlights interval must be 4–12 seconds");
    }
    if (key === "home.highlights.maxSlides" && (value < 1 || value > 10)) {
      throw new SettingValidationError("Highlights maximum must be 1–10 slides");
    }
  }

  if (key === "home.hero.headline") {
    localizedText(value, "home.hero.headline", 60);
  }
  if (key === "home.hero.subheadline") {
    localizedText(value, "home.hero.subheadline", 140);
  }
  if (key === "home.highlights.title") {
    localizedText(value, "home.highlights.title", 40, true);
  }
  if (key === "home.hero.chips") {
    if (!Array.isArray(value)) {
      throw new SettingValidationError("home.hero.chips must be a list");
    }
    if (value.length > 8) {
      throw new SettingValidationError("Use at most 8 hero chips");
    }
    value.forEach((chip, index) => {
      if (!isRecord(chip)) {
        throw new SettingValidationError(`Chip ${index + 1} is invalid`);
      }
      localizedText(
        { bn: chip.labelBn, en: chip.labelEn },
        `Chip ${index + 1} label`,
        40,
      );
      if (!isSafePublicLink(chip.href)) {
        throw new SettingValidationError(
          `Chip ${index + 1} must link to a same-site path or an https URL`,
        );
      }
    });
  }
  if (key === "home.hero.image") {
    if (!isRecord(value)) {
      throw new SettingValidationError("home.hero.image must be an object");
    }
    const url = stringValue(value.url);
    const mobileUrl = stringValue(value.mobileUrl);
    if (url !== "" && !isSafePublicLink(url)) {
      throw new SettingValidationError("Hero image URL must be https or a same-site path");
    }
    if (mobileUrl !== "" && !isSafePublicLink(mobileUrl)) {
      throw new SettingValidationError("Hero mobile image URL must be https or a same-site path");
    }
    localizedText({ bn: value.altBn ?? "", en: value.altEn ?? "" }, "Hero image alt", 120, true);
    for (const field of ["focalX", "focalY"] as const) {
      const focal = value[field];
      if (focal !== undefined && (typeof focal !== "number" || focal < 0 || focal > 100)) {
        throw new SettingValidationError(`${field} must be between 0 and 100`);
      }
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
    const effectiveAdvance = effectiveAdvanceFrom(merged);
    if (!effectiveAdvance) {
      details["payment.cod.enabled"] =
        "COD cannot be disabled until Advance payment is live and a provider number is configured";
    }
  }
  for (const role of ["customer", "seller", "admin"] as const) {
    const sliding = Number(merged[`security.refresh.${role}.days`]);
    const absolute = Number(merged[`security.refresh.${role}.maxDays`]);
    if (Number.isFinite(sliding) && Number.isFinite(absolute) && absolute < sliding) {
      details[`security.refresh.${role}.maxDays`] =
        `Maximum lifetime cannot be shorter than the sliding lifetime for ${role}`;
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
