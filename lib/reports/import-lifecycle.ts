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
  try {
    await bindUpload(input.file, run.id);
    for (let offset = 0; offset < input.rows.length; offset += 1000) {
      const staged = await client.rpc("stage_report_chunk", { p_import: run.id, p_chunk: offset / 1000, p_rows: input.rows.slice(offset, offset + 1000) as Json });
      if (staged.error) throw new Error("Staging failed");
    }
    const committed = await client.rpc("commit_report_import", { p_import: run.id });
    if (committed.error || !committed.data) throw new Error("Commit response unavailable");
    return committed.data as unknown as ImportResult;
  } catch {
    // Never mark a successful commit failed after losing its HTTP response.
    // The RPC only marks non-processed imports failed. Replaying returns result.
    await client.rpc("fail_report_import", { p_import: run.id });
    return { ok: false, message: "Import interrupted. No partial report is published. Retry the same file to resume safely." };
  }
}
