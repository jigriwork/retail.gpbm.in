import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac } from "node:crypto";

// Only the owner sees customers' mobile numbers. Everyone else's pages carry
// an encrypted reference in links and buttons instead, so the number never
// reaches their browser; server actions turn it back into the number.

const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const key = () => createHash("sha256").update(`customer-ref:${secret()}`).digest();

/** Stable, opaque reference for a mobile (same number, same reference). */
export function customerRef(mobile: string) {
  const iv = createHmac("sha256", secret()).update(`iv:${mobile}`).digest().subarray(0, 12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(mobile, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** A reference (or a mobile typed by someone who already knows it) back to the mobile. */
export function resolveCustomerRef(value: string) {
  if (/^[6-9]\d{9}$/.test(value)) return value;
  try {
    const raw = Buffer.from(value, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const mobile = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    return /^[6-9]\d{9}$/.test(mobile) ? mobile : null;
  } catch {
    return null;
  }
}

export function maskMobile(mobile: string) {
  return `${mobile.slice(0, 2)}xxxxx${mobile.slice(-3)}`;
}
