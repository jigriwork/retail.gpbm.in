import "server-only";

import { emailConfigured, sendEmail, simpleEmailHtml } from "@/lib/email/send";
import { getMsg91Config } from "@/lib/msg91/config";
import { getMsg91TemplateStatus, sendMsg91Template } from "@/lib/msg91/client";
import { claimWhatsAppDeliveries, finishWhatsAppDeliveries } from "@/lib/msg91/deliveries";
import { whatsappUnitCost } from "@/lib/msg91/budget";
import { createAdminClient } from "@/lib/supabase/server";

// Password reset links and "your account is ready" notices, sent by the app
// itself (Supabase's built-in mailer only delivers to the project team).

export const accountReadyTemplate = process.env.MSG91_ACCOUNT_READY_TEMPLATE?.trim() || "gpbm_account_ready_v1";
export const accountReadyTemplateBody = [
  "Hello {{1}}, your GPBM Retail account is approved ✅",
  "",
  "Log in at https://retail.gpbm.in with your email {{2}} and the temporary code your manager gave you. Please change the code after you log in.",
  "",
  "– Team GPBM",
].join("\n");

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://retail.gpbm.in").replace(/\/$/, "");
}

async function audit(action: string, entityId: string | null, metadata: Record<string, string | boolean | null>) {
  const admin = createAdminClient();
  if (!admin) return;
  try {
    await admin.from("audit_logs").insert({ action, actor_id: null, actor_role: null, entity_id: entityId, entity_type: "profile", metadata });
  } catch {
    // Logging never blocks sign-in emails.
  }
}

/**
 * Emails a one-time password reset link. Quietly does nothing for unknown or
 * inactive accounts, and at most once a minute / five times an hour per account,
 * so the public form can't be used to flood an inbox.
 */
export async function sendPasswordResetEmail(email: string, origin = siteUrl()): Promise<{ ok: boolean; message?: string }> {
  const admin = createAdminClient();
  const address = email.trim().toLowerCase();
  if (!admin || !emailConfigured()) return { ok: false, message: "Email sending is not configured." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || address.length > 200) return { ok: true };

  const { data: profile } = await admin.from("profiles").select("id,full_name,is_active")
    .ilike("email", address.replace(/[\\%_]/g, (char) => `\\${char}`)).maybeSingle();
  if (!profile?.is_active) return { ok: true };

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin.from("audit_logs").select("created_at")
    .eq("action", "password_reset_email").eq("entity_id", profile.id).gte("created_at", hourAgo)
    .order("created_at", { ascending: false }).limit(5);
  if ((recent?.length ?? 0) >= 5 || (recent?.[0]?.created_at && Date.parse(recent[0].created_at) > Date.now() - 60_000)) return { ok: true };

  const { data, error } = await admin.auth.admin.generateLink({ email: address, type: "recovery" });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return { ok: false, message: "The reset link could not be created. Please retry." };

  const link = `${origin.replace(/\/$/, "")}/reset-password?${new URLSearchParams({ token_hash: tokenHash, type: "recovery" })}`;
  const name = profile.full_name?.split(" ")[0] || "there";
  const sent = await sendEmail({
    html: simpleEmailHtml({
      action: { href: link, label: "Set a new password" },
      paragraphs: [
        `Hello ${name},`,
        "We got a request to reset your GPBM Retail password. Tap the button below to choose a new one. The link works once and expires in 1 hour.",
        "If you didn't ask for this, you can ignore this email. Your password stays the same.",
      ],
      title: "Reset your password",
    }),
    subject: "Reset your GPBM Retail password",
    text: `Hello ${name},\n\nReset your GPBM Retail password here (works once, expires in 1 hour):\n${link}\n\nIf you didn't ask for this, ignore this email.\n\n– Team GPBM`,
    to: address,
  });
  await audit("password_reset_email", profile.id, { delivered_to_provider: sent.ok, error: sent.error ?? null });
  return sent.ok ? { ok: true } : { ok: false, message: "The reset email could not be sent. Please retry." };
}

function whatsappNumber(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const digits = (value ?? "").replace(/\D/g, "").replace(/^(?:91|0)(?=[6-9]\d{9}$)/, "");
    if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  }
  return null;
}

/**
 * Tells a person their account is ready, by email and (when a mobile and an
 * approved template exist) WhatsApp. Never throws: account creation must not
 * fail because a notice could not go out. Returns a short line for the UI.
 */
export async function notifyAccountReady(input: {
  email: string;
  initiatedBy: string;
  name: string;
  phones: Array<string | null | undefined>;
  storeId: string | null;
  userId: string;
}) {
  const sentBy: string[] = [];
  try {
    const firstName = input.name.trim().split(/\s+/)[0] || "there";
    const login = `${siteUrl()}/login`;
    const mail = await sendEmail({
      html: simpleEmailHtml({
        action: { href: login, label: "Open GPBM Retail" },
        paragraphs: [
          `Hello ${firstName},`,
          "Your GPBM Retail account is approved.",
          `Log in with this email (${input.email}) and the temporary code your manager gave you. Please change the code after you log in.`,
        ],
        title: "Your account is ready",
      }),
      subject: "Your GPBM Retail account is ready",
      text: `Hello ${firstName},\n\nYour GPBM Retail account is approved.\nLog in at ${login} with this email (${input.email}) and the temporary code your manager gave you. Please change the code after you log in.\n\n– Team GPBM`,
      to: input.email,
    });
    if (mail.ok) sentBy.push("email");

    const to = whatsappNumber(...input.phones);
    const admin = createAdminClient();
    if (to && admin) {
      const { data: store } = input.storeId
        ? await admin.from("stores").select("id,code").eq("id", input.storeId).maybeSingle()
        : await admin.from("stores").select("id,code").eq("code", "GP").maybeSingle();
      const code = store?.code?.toUpperCase();
      const config = code === "GP" || code === "BM" ? getMsg91Config(code) : null;
      if (store && config && (await getMsg91TemplateStatus(config, accountReadyTemplate)) === "approved") {
        const dedupeKey = `account-ready:${input.userId}`;
        const { claims } = await claimWhatsAppDeliveries([{
          brandCode: config.brand, dedupeKey, initiatedBy: input.initiatedBy, kind: "account_ready", recipient: to,
          referenceId: input.userId, storeId: store.id, templateName: accountReadyTemplate, unitCostInr: whatsappUnitCost("account_ready"),
        }]);
        const claim = claims.find((item) => item.dedupeKey === dedupeKey);
        if (claim) {
          const delivery = await sendMsg91Template(config, accountReadyTemplate, [{
            components: { body_1: { type: "text", value: firstName.slice(0, 60) }, body_2: { type: "text", value: input.email.slice(0, 120) } },
            to,
          }]);
          await finishWhatsAppDeliveries([claim.id], delivery);
          if (delivery.ok) sentBy.push("WhatsApp");
        }
      }
    }
  } catch (error) {
    console.error("account_ready_notice_failed", error instanceof Error ? error.message : "unknown");
  }
  return sentBy.length ? ` Login details sent by ${sentBy.join(" and ")}.` : "";
}
