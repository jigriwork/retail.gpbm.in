import { NextResponse } from "next/server";

import { getMyPayslips } from "@/lib/staff/portal";

export async function GET() {
  const payslips = await getMyPayslips();
  return NextResponse.json(payslips ?? { error: "Recent password verification required" }, { status: payslips ? 200 : 401, headers: { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache" } });
}
