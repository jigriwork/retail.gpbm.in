import "server-only";

import type { Msg91BrandConfig } from "@/lib/msg91/config";

const apiBase = "https://control.msg91.com/api/v5/whatsapp";

export type Msg91Component = {
  type: "document" | "text";
  value: string;
};

export type Msg91Recipient = {
  components: Record<string, Msg91Component>;
  to: string;
};

export type Msg91SendResult = {
  errorCode?: string;
  ok: boolean;
  requestId?: string;
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstString(value: unknown, keys: string[]): string | undefined {
  const record = object(value);
  if (!record) return undefined;
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key]) return String(record[key]).slice(0, 200);
  }
  for (const nested of Object.values(record)) {
    const found = firstString(nested, keys);
    if (found) return found;
  }
  return undefined;
}

function responseHasError(body: unknown) {
  const record = object(body);
  if (!record) return false;
  return record.hasError === true || record.success === false || record.status === "error" || record.type === "error";
}

async function responseBody(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function sendMsg91Template(
  config: Msg91BrandConfig,
  templateName: string,
  recipients: Msg91Recipient[],
): Promise<Msg91SendResult> {
  if (!recipients.length || recipients.length > 50) {
    return { ok: false, errorCode: "invalid_batch_size" };
  }

  try {
    const response = await fetch(`${apiBase}/whatsapp-outbound-message/bulk/`, {
      body: JSON.stringify({
        integrated_number: config.integratedNumber,
        content_type: "template",
        payload: {
          type: "template",
          template: {
            name: templateName,
            language: { code: config.language, policy: "deterministic" },
            to_and_components: recipients.map((recipient) => ({
              to: [recipient.to],
              components: recipient.components,
            })),
          },
          messaging_product: "whatsapp",
        },
      }),
      headers: {
        accept: "application/json",
        authkey: config.authKey,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(20_000),
    });
    const body = await responseBody(response);
    const ok = response.ok && !responseHasError(body);
    return {
      ok,
      requestId: firstString(body, ["request_id", "requestId", "requestID"]),
      errorCode: ok ? undefined : `msg91_http_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: error instanceof DOMException && error.name === "TimeoutError" ? "msg91_timeout" : "msg91_unavailable",
    };
  }
}

export async function getMsg91TemplateStatus(config: Msg91BrandConfig, templateName: string) {
  try {
    const response = await fetch(`${apiBase}/get-template-client/${encodeURIComponent(config.integratedNumber)}?`, {
      headers: { accept: "application/json", authkey: config.authKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return "unavailable";
    const body = await responseBody(response);
    const statuses: string[] = [];
    const visit = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(visit);
      const record = object(node);
      if (!record) return;
      const name = record.name ?? record.template_name ?? record.element_name;
      if (name === templateName && typeof record.status === "string") statuses.push(record.status.toLowerCase());
      Object.values(record).forEach(visit);
    };
    visit(body);
    if (statuses.includes("approved")) return "approved";
    return statuses[0] ?? "not_found";
  } catch {
    return "unavailable";
  }
}


/** Submits a WhatsApp template (body text only) to MSG91 for Meta's approval. */
export async function createMsg91Template(config: Msg91BrandConfig, template: { body: string; category: "MARKETING" | "UTILITY"; examples: string[]; name: string }) {
  try {
    const response = await fetch(`${apiBase}/client-panel-template/`, {
      body: JSON.stringify({
        integrated_number: config.integratedNumber,
        template_name: template.name,
        language: config.language,
        category: template.category,
        button_url: "false",
        components: [{ type: "BODY", text: template.body, example: { body_text: [template.examples] } }],
      }),
      headers: { accept: "application/json", authkey: config.authKey, "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(20_000),
    });
    const body = await responseBody(response);
    return { ok: response.ok && !responseHasError(body), response: JSON.stringify(body)?.slice(0, 500) ?? null, status: response.status };
  } catch {
    return { ok: false, response: null, status: 0 };
  }
}
