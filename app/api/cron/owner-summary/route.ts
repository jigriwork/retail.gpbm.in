import { NextResponse } from "next/server";

import { runOwnerDailySummary } from "@/lib/owner-summary/run";

export const runtime = "nodejs";
export const maxDuration = 60;

// Supabase pg_cron (POST, exactly 9:00 AM IST) and the Vercel backup cron
// (GET, later the same morning) both call this; each day sends only once.
// ?preview=1 returns the message text without sending.
async function handle(request: Request) {
  const header = request.headers.get("authorization");
  const allowed = [process.env.CRON_SECRET, process.env.OWNER_SUMMARY_CRON_SECRET].filter((secret): secret is string => Boolean(secret));
  if (!allowed.some((secret) => header === `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    return NextResponse.json(await runOwnerDailySummary({ preview }));
  } catch (error) {
    console.error("owner_summary_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Owner summary run failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
