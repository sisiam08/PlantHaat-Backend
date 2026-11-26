/**
 * One payout-destination validation used by the server and mirrored by the
 * seller form:
 * - bKash / Nagad: a Bangladeshi mobile number (same regex as payment submissions).
 * - Bank: 6-34 digits, spaces and hyphens allowed.
 * Existing stored rows are never rewritten; invalid legacy rows are flagged and
 * withdrawals are blocked until the seller replaces them.
 */
export const BD_MOBILE_REGEX = /^(?:\+?88)?01[3-9]\d{8}$/;
export const BD_MOBILE_MESSAGE = "Enter a valid Bangladeshi mobile number";
export const BANK_ACCOUNT_MESSAGE =
  "Enter a valid bank account number (6-34 digits; spaces and hyphens allowed)";

export function bankAccountDigits(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function payoutDestinationError(method: string, raw: string): string | null {
  const value = raw.trim();
  if (method === "BKASH" || method === "NAGAD") {
    return BD_MOBILE_REGEX.test(value) ? null : BD_MOBILE_MESSAGE;
  }
  if (method === "BANK") {
    const digits = bankAccountDigits(value);
    return /^\d{6,34}$/.test(digits) ? null : BANK_ACCOUNT_MESSAGE;
  }
  return "Unsupported payout method";
}
