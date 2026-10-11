import "server-only";

// Transactional email through Mailgun's HTTP API, sent as "GPBM" from the
// verified reports.gpbm.in domain. MAILGUN_DOMAIN is the inbound/sandbox domain,
// so sending uses its own MAILGUN_SENDING_DOMAIN.

export type EmailResult = { ok: boolean; error?: string };

export function emailConfigured() {
  return Boolean(process.env.MAILGUN_API_KEY?.trim());
}

export async function sendEmail(message: { html: string; subject: string; text: string; to: string }): Promise<EmailResult> {
  const key = process.env.MAILGUN_API_KEY?.trim();
  if (!key) return { ok: false, error: "email_not_configured" };
  const domain = process.env.MAILGUN_SENDING_DOMAIN?.trim() || "reports.gpbm.in";
  const base = (process.env.MAILGUN_BASE_URL?.trim() || "https://api.mailgun.net").replace(/\/$/, "");
  const form = new FormData();
  form.set("from", process.env.EMAIL_FROM?.trim() || `GPBM <no-reply@${domain}>`);
  form.set("to", message.to);
  form.set("subject", message.subject);
  form.set("text", message.text);
  form.set("html", message.html);
  // Link tracking would rewrite one-time login links.
  form.set("o:tracking", "no");
  try {
    const response = await fetch(`${base}/v3/${domain}/messages`, {
      body: form,
      headers: { authorization: `Basic ${Buffer.from(`api:${key}`).toString("base64")}` },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok ? { ok: true } : { ok: false, error: `mailgun_http_${response.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof DOMException && error.name === "TimeoutError" ? "mailgun_timeout" : "mailgun_unavailable" };
  }
}

const escapeMap: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

/** A short branded email: greeting, paragraphs, one button, footer. */
export function simpleEmailHtml({ action, paragraphs, title }: { action?: { href: string; label: string }; paragraphs: string[]; title: string }) {
  const body = paragraphs.map((text) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155">${escapeHtml(text)}</p>`).join("");
  const button = action
    ? `<p style="margin:22px 0"><a href="${escapeHtml(action.href)}" style="display:inline-block;background:#3730a3;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px">${escapeHtml(action.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px 18px">
<p style="margin:0 0 18px;font-size:14px;font-weight:700;color:#3730a3">GPBM Retail</p>
<div style="background:#ffffff;border-radius:18px;padding:26px 22px;border:1px solid #e7e5e4">
<h1 style="margin:0 0 16px;font-size:22px;color:#0f172a">${escapeHtml(title)}</h1>${body}${button}
</div>
<p style="margin:16px 4px 0;font-size:12px;color:#78716c">Sent by GPBM (Go Planet · Brand Mark), Berhampur.</p>
</div></body></html>`;
}
