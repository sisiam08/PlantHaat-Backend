/**
 * The production settings baseline. Dev currently holds the owner's real bKash
 * number and Advance ON; none of that may be copied to production.
 */
export const PRODUCTION_SETTINGS_BASELINE: Record<string, unknown> = {
  "payment.advance.enabled": false,
  "payment.bkash.enabled": false,
  "payment.bkash.number": "",
  "payment.nagad.enabled": false,
  "payment.nagad.number": "",
  "payment.cod.enabled": true,
};

export interface BaselineChange {
  key: string;
  current: string;
  next: string;
  sensitive: boolean;
}

function maskNumber(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 5) return trimmed === "" ? "(empty)" : "***";
  return `${trimmed.slice(0, 3)}***${trimmed.slice(-2)}`;
}

function display(key: string, value: unknown): string {
  if (key.endsWith(".number")) {
    const text = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value);
    return maskNumber(text);
  }
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  return JSON.stringify(value ?? null);
}

export function buildProductionBaselineChanges(
  current: Record<string, unknown>,
): BaselineChange[] {
  return Object.entries(PRODUCTION_SETTINGS_BASELINE)
    .filter(([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value))
    .map(([key, value]) => ({
      key,
      current: display(key, current[key] ?? ""),
      next: display(key, value),
      sensitive: key === "payment.advance.enabled" || key.endsWith(".number"),
    }));
}
