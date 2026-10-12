import { NextResponse } from "next/server";

import { runCustomerFollowups } from "@/lib/msg91/followup-automation";
import { syncWhatsAppStatuses } from "@/lib/msg91/log-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const statusSync = await syncWhatsAppStatuses({ force: true }).catch(() => null);
    return NextResponse.json({ ...(await runCustomerFollowups()), statusSync });
  } catch (error) {
    console.error("customer_followup_cron_failed", error);
    return NextResponse.json({ error: "Customer follow-up run failed." }, { status: 500 });
  }
}
