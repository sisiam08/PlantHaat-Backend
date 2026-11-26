export const ADVANCE_PROVIDERS = ["BKASH", "NAGAD", "ROCKET", "UPAY"] as const;
export type AdvanceProvider = (typeof ADVANCE_PROVIDERS)[number];

export const ADVANCE_PROVIDER_META: Record<
  AdvanceProvider,
  { label: string; enabledKey: string; numberKey: string }
> = {
  BKASH: { label: "bKash", enabledKey: "payment.bkash.enabled", numberKey: "payment.bkash.number" },
  NAGAD: { label: "Nagad", enabledKey: "payment.nagad.enabled", numberKey: "payment.nagad.number" },
  ROCKET: { label: "Rocket", enabledKey: "payment.rocket.enabled", numberKey: "payment.rocket.number" },
  UPAY: { label: "Upay", enabledKey: "payment.upay.enabled", numberKey: "payment.upay.number" },
};
