import { NextResponse } from "next/server";

import { retryDroppedMessages } from "@/lib/msg91/customer-send";
import { syncWhatsAppStatuses } from "@/lib/msg91/log-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Supabase pg_cron calls this every 30 minutes: read MSG91's WhatsApp logs,
// then resend customer messages MSG91 accepted but never sent.
async function handle(request: Request) {
  const header = request.headers.get("authorization");
  const allowed = [process.env.CRON_SECRET, process.env.OWNER_SUMMARY_CRON_SECRET].filter((secret): secret is string => Boolean(secret));
  if (!allowed.some((secret) => header === `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const sync = await syncWhatsAppStatuses({ force: true });
    const retry = sync.ok ? await retryDroppedMessages() : { retried: 0, sent: 0, skipped: "sync_failed" };
    return NextResponse.json({ retry, sync });
  } catch (error) {
    console.error("whatsapp_sync_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "WhatsApp sync failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
