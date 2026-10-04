import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getMsg91Config, type Msg91BrandCode } from "@/lib/msg91/config";
import type { Json, TablesUpdate } from "@/lib/supabase/database.types";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 20;

type RecordValue = Record<string, unknown>;

function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function firstField(value: unknown, keys: string[], depth = 0): unknown {
  if (depth > 5) return undefined;
  const record = object(value);
  if (!record) return undefined;
  for (const key of keys) if (record[key] !== undefined && record[key] !== null) return record[key];
  for (const nested of Object.values(record)) {
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = firstField(item, keys, depth + 1);
        if (found !== undefined) return found;
      }
    } else {
      const found = firstField(nested, keys, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function textField(payload: unknown, keys: string[]) {
  const value = firstField(payload, keys);
  return typeof value === "string" ? value.trim() : "";
}

function sameSecret(candidate: string, expected: string) {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function localMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.slice(-10);
  return /^[6-9]\d{9}$/.test(local) ? local : "";
}

function webhookBrand(integratedNumber: string): Msg91BrandCode | null {
  const normalized = integratedNumber.replace(/\D/g, "");
  for (const code of ["GP", "BM"] as const) {
    if (getMsg91Config(code)?.integratedNumber === normalized) return code;
  }
  return null;
}

function statusFor(value: string) {
  const status = value.toLowerCase();
  if (status.includes("read")) return "read" as const;
  if (status.includes("deliver")) return "delivered" as const;
  if (status.includes("sent") || status.includes("accept")) return "accepted" as const;
  if (status.includes("fail") || status.includes("reject") || status.includes("error")) return "failed" as const;
  return null;
}

export async function POST(request: Request) {
  const expected = process.env.MSG91_WEBHOOK_SECRET;
  const url = new URL(request.url);
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const supplied = url.searchParams.get("secret") ?? request.headers.get("x-webhook-secret") ?? bearer;
  if (!expected || !sameSecret(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 256_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service unavailable" }, { status: 503 });

  const recipient = textField(payload, ["customerNumber", "customer_number", "recipient", "to", "from"]);
  const integratedNumber = textField(payload, ["integratedNumber", "integrated_number"]);
  const templateName = textField(payload, ["templateName", "template_name"]);
  const requestId = textField(payload, ["requestId", "request_id", "requestID"]);
  const event = textField(payload, ["eventName", "event_name", "status", "event"]);
  const messageText = textField(payload, ["text", "body", "buttonText", "button_text"]);
  const brand = webhookBrand(integratedNumber);
  const mobile = localMobile(recipient);

  if (mobile && messageText.toUpperCase() === "STOP") {
    const now = new Date().toISOString();
    const { data: optedOut, error } = await admin.from("customer_profiles").update({
      do_not_contact: true,
      marketing_consent: false,
      withdrawn_at: now,
    }).eq("mobile", mobile).eq("do_not_contact", false).select("mobile").maybeSingle();
    if (error) return NextResponse.json({ error: "Opt-out could not be saved" }, { status: 500 });

    if (optedOut) {
      let storeId: string | null = null;
      if (brand) {
        const { data: store } = await admin.from("stores").select("id").eq("code", brand).maybeSingle();
        storeId = store?.id ?? null;
      }
      await admin.from("audit_logs").insert({
        action: "customer_whatsapp_opt_out",
        actor_id: null,
        actor_role: null,
        entity_id: null,
        entity_type: "customer_profile",
        metadata: { brand, mobile_last4: mobile.slice(-4), source: "msg91_webhook" } satisfies Json,
        store_id: storeId,
      });
    }
  }

  const status = statusFor(event);
  if (status && mobile) {
    let query = admin.from("whatsapp_deliveries")
      .select("id,status")
      .eq("recipient", `91${mobile}`);
    if (requestId) query = query.eq("provider_request_id", requestId);
    if (templateName) query = query.eq("template_name", templateName);
    const { data: deliveries } = await query.order("created_at", { ascending: false }).limit(requestId ? 50 : 1);
    const rank = { processing: 0, accepted: 1, delivered: 2, read: 3, failed: 4 } as const;
    const now = new Date().toISOString();
    for (const delivery of deliveries ?? []) {
      const current = delivery.status as keyof typeof rank;
      if (status !== "failed" && (rank[current] ?? 0) >= rank[status]) continue;
      if (status === "failed" && (current === "delivered" || current === "read")) continue;
      const update: TablesUpdate<"whatsapp_deliveries"> = { status };
      if (status === "accepted") update.accepted_at = now;
      if (status === "delivered") update.delivered_at = now;
      if (status === "read") update.read_at = now;
      if (status === "failed") {
        update.failed_at = now;
        update.error_code = textField(payload, ["errorCode", "error_code", "reason"]).slice(0, 120) || "msg91_failed";
      }
      await admin.from("whatsapp_deliveries").update(update).eq("id", delivery.id);
    }
  }

  return NextResponse.json({ ok: true });
}
