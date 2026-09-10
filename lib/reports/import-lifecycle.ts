import "server-only";
import { bindUpload } from "@/lib/uploads/server";
import { createHash } from "node:crypto";
import { requireProfile, canAccessStore } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type ImportDay = { date: string; row_count: number; summary: Json; target_id?: string };
export type ImportRow = { logical_date: string; [key: string]: Json | undefined };
type ImportResult = { ok: boolean; message: string; report_ids?: string[]; batch_id?: string | null };

export async function importReportFile(input: {
  file: File; storeId: string; type: "sales" | "stock" | "salary_attendance";
  manifest: ImportDay[]; rows: ImportRow[]; mode?: "stop" | "skip" | "replace"; bulk?: boolean;
}): Promise<ImportResult> {
  const { profile } = await requireProfile();
  if (!profile || profile.is_active !== true || !(await canAccessStore(input.storeId, profile))) {
    return { ok: false, message: "Store access denied." };
  }
  if ((input.mode === "replace" || input.bulk) && profile.role !== "owner") return { ok: false, message: "Owner required." };
  const fingerprint = createHash("sha256").update(new Uint8Array(await input.file.arrayBuffer()))
    .update(JSON.stringify({ store: input.storeId, type: input.type, mode: input.mode ?? "stop", bulk: input.bulk ?? false,
      days: input.manifest.map(day => ({ date: day.date, target: day.target_id ?? null })).sort((a, b) => a.date.localeCompare(b.date)) })).digest("hex");
  const client = await createClient();
  const { data, error } = await client.rpc("begin_report_import", {
    p_store: input.storeId, p_type: input.type, p_fingerprint: fingerprint, p_file_name: input.file.name,
    p_manifest: input.manifest as unknown as Json, p_mode: input.mode ?? "stop", p_bulk: input.bulk ?? false,
  });
  if (error || !data) return { ok: false, message: "Import could not start. Check access and retry." };
  const run = data as unknown as { id: string; file_path: string; status: string; result: ImportResult };
  if (run.status === "processed") return run.result;
  let phase = "bind";
  const started = Date.now();
  let phaseStarted = started;
  let stagedMs = 0;
  let failureCode = "unknown";
  try {
    await bindUpload(input.file, run.id);
    phase = "stage"; phaseStarted = Date.now();
    for (let offset = 0; offset < input.rows.length; offset += 1000) {
      const staged = await client.rpc("stage_report_chunk", { p_import: run.id, p_chunk: offset / 1000, p_rows: input.rows.slice(offset, offset + 1000) as Json });
      if (staged.error) { failureCode = staged.error.code; throw new Error("Staging failed"); }
    }
    stagedMs = Date.now() - phaseStarted;
    phase = "commit"; phaseStarted = Date.now();
    const committed = await client.rpc("commit_report_import", { p_import: run.id });
    if (committed.error || !committed.data) { failureCode = committed.error?.code ?? "no_response"; throw new Error("Commit response unavailable"); }
    console.info("report_import_completed", { importId: run.id, type: input.type, rows: input.rows.length,
      ok: (committed.data as unknown as ImportResult).ok, stagedMs: Math.round(stagedMs), commitMs: Math.round(Date.now() - phaseStarted),
      elapsedMs: Math.round(Date.now() - started), rssMiB: Math.round(process.memoryUsage().rss / 1048576) });
    return committed.data as unknown as ImportResult;
  } catch {
    // Codes and timings only: database messages/details can contain uploaded data.
    console.error("report_import_failed", { importId: run.id, type: input.type, phase,
      code: /^[A-Za-z0-9_]{1,24}$/.test(failureCode) ? failureCode : "unknown",
      rows: input.rows.length, phaseMs: Math.round(Date.now() - phaseStarted), elapsedMs: Math.round(Date.now() - started) });
    // Never mark a successful commit failed after losing its HTTP response.
    // The RPC only marks non-processed imports failed. Replaying returns result.
    await client.rpc("fail_report_import", { p_import: run.id });
    return { ok: false, message: "Import interrupted. No partial report is published. Retry the same file to resume safely." };
  }
}
