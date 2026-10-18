import { NextResponse } from "next/server";

import { retryDroppedMessages } from "@/lib/msg91/customer-send";
import { runFestiveCampaign } from "@/lib/msg91/festive-campaign";
import { syncWhatsAppStatuses } from "@/lib/msg91/log-sync";
import { runReceiptBackfill } from "@/lib/msg91/receipt-backfill";

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
    // One-time: once a store's purchase receipt is approved, test it to the owner and resend failed thank-yous.
    const receipts = await runReceiptBackfill().catch((error) => ({ error: error instanceof Error ? error.message : "failed" }));
    // One-off: day 2 of the Brand Mark festive offer (19 Oct, from 10 AM).
    const festive = sync.ok ? await runFestiveCampaign().catch((error) => ({ error: error instanceof Error ? error.message : "failed" })) : { skipped: "sync_failed" };
    return NextResponse.json({ festive, receipts, retry, sync });
  } catch (error) {
    console.error("whatsapp_sync_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "WhatsApp sync failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
