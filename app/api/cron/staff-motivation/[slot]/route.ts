import { NextResponse } from "next/server";

import { runReleaseAnnouncement, runStaffMotivation, type StaffMotivationSlot } from "@/lib/notifications/staff-motivation";
import packageJson from "@/package.json";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request, context: { params: Promise<{ slot: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slot } = await context.params;
  try {
    if (slot === "release") return NextResponse.json(await runReleaseAnnouncement(packageJson.version));
    if (slot !== "morning" && slot !== "evening") {
      return NextResponse.json({ error: "Unknown reminder slot." }, { status: 404 });
    }
    return NextResponse.json(await runStaffMotivation(slot as StaffMotivationSlot));
  } catch (error) {
    console.error("staff_motivation_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Staff motivation could not be sent." }, { status: 500 });
  }
}
