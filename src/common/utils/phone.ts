const BD_PHONE_PATTERN = /^(?:\+?88)?01[3-9]\d{8}$/;

export function isValidBdPhone(value: string): boolean {
  return BD_PHONE_PATTERN.test(value.trim().replace(/[\s-]/g, ""));
}

export function normalizeBdPhone(value: string): string {
  const compact = value.trim().replace(/[\s-]/g, "");
  if (!BD_PHONE_PATTERN.test(compact)) {
    throw new Error(`Invalid Bangladeshi phone number: ${value}`);
  }
  const local = compact.replace(/^\+?88/, "");
  return `+88${local}`;
}
