import { NextResponse } from "next/server";

import { runOwnerNightPlan, sendOwnerNightTest, setupOwnerNightTemplate } from "@/lib/owner-night/run";

export const runtime = "nodejs";
export const maxDuration = 60;

// Supabase pg_cron (POST, 11:00 PM IST with a retry at 11:10 PM) calls
// this; each night sends only once.
// ?preview=1 returns the message text without sending; ?day=YYYY-MM-DD picks
// a day (sent once per day and recipient).
async function handle(request: Request) {
  const header = request.headers.get("authorization");
  const allowed = [process.env.CRON_SECRET, process.env.OWNER_SUMMARY_CRON_SECRET].filter((secret): secret is string => Boolean(secret));
  if (!allowed.some((secret) => header === `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const params = new URL(request.url).searchParams;
    // ?setup=template submits the WhatsApp template to MSG91 (or reports its status).
    if (params.get("setup") === "template") return NextResponse.json(await setupOwnerNightTemplate());
    // ?test=<mobile> sends one test of today's plan to that number; tonight's message still goes.
    if (params.get("test")) return NextResponse.json(await sendOwnerNightTest(params.get("test")!));
    const preview = params.get("preview") === "1";
    const day = params.get("day") ?? undefined;
    return NextResponse.json(await runOwnerNightPlan({ day, preview }));
  } catch (error) {
    console.error("owner_night_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Night plan run failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
