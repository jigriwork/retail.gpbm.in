export const phoneHeaderAliases = [
  "phone",
  "mobile",
  "mobile no",
  "mobile number",
  "contact",
  "contact number",
  "employee phone",
  "staff phone",
  "whatsapp",
  "whatsapp number",
] as const;

export function normalizeStaffName(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export function staffNameKey(value: unknown) {
  return normalizeStaffName(value).toLowerCase();
}

export function normalizePhone(value: unknown) {
  const original = String(value ?? "").trim();
  if (!original) {
    return { employeePhone: "", isValid: false, raw: original, whatsappPhone: "" };
  }

  let digits = original.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+91")) {
    digits = digits.slice(1);
  }
  digits = digits.replace(/\D/g, "");

  if (/^[6-9]\d{9}$/.test(digits)) {
    digits = `91${digits}`;
  }

  const isValid = /^91[6-9]\d{9}$/.test(digits);

  return {
    employeePhone: isValid ? digits : "",
    isValid,
    raw: original,
    whatsappPhone: isValid ? digits : "",
  };
}

export function appendWarning(current: string | null | undefined, next: string) {
  if (!current) return next;
  if (current.includes(next)) return current;
  return `${current} ${next}`;
}
