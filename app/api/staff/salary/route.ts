import { NextResponse } from "next/server";

import { getMySalary } from "@/lib/staff/portal";

export async function GET() {
  const salary = await getMySalary();
  return NextResponse.json(salary ?? { error: "Recent password verification required" }, { status: salary ? 200 : 401, headers: { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" } });
}
