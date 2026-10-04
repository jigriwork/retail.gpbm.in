"use server";

import { revalidatePath } from "next/cache";

import { getFinanceSession } from "@/lib/accounts/access";
import { parseGstr2b } from "@/lib/accounts/gstr2b";
import type { AccountsActionState } from "@/lib/accounts/master-actions";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/** Reads a stored GSTR-2B JSON and imports its documents for the chosen firm. */
export async function importGstr2b(_state: AccountsActionState, formData: FormData): Promise<AccountsActionState> {
  const session = await getFinanceSession();
  if (!session.can.post) return { ok: false, message: "You cannot import GST data." };
  const documentId = String(formData.get("documentId") ?? "");
  const firmId = String(formData.get("firmId") ?? "");
  const supabase = await createClient();
  const [{ data: document }, { data: firm }] = await Promise.all([
    supabase.from("finance_documents").select("id,kind,file_path,byte_size,status").eq("id", documentId).maybeSingle(),
    supabase.from("billing_firms").select("id,name,gstin").eq("id", firmId).maybeSingle(),
  ]);
  if (!document || document.kind !== "gst_return" || !["stored", "reviewed"].includes(document.status)) return { ok: false, message: "Choose a stored GSTR-2B file." };
  if (!firm) return { ok: false, message: "Choose the firm." };
  if (!firm.gstin) return { ok: false, message: `Enter ${firm.name}'s GSTIN under Accounts → Firms & stores first, so the file can be checked against it.` };
  if (document.byte_size > 20 * 1024 * 1024) return { ok: false, message: "The file is too large." };
  const { data: blob, error } = await supabase.storage.from("finance-docs").download(document.file_path, {}, { signal: AbortSignal.timeout(30000) });
  if (error || !blob) return { ok: false, message: "The stored file could not be read. Please retry." };
  let parsed: ReturnType<typeof parseGstr2b>;
  try {
    parsed = parseGstr2b(JSON.parse((await blob.text()).replace(/^﻿/, "")));
  } catch {
    return { ok: false, message: "The file is not valid JSON. Download GSTR-2B again from the GST portal (Download JSON)." };
  }
  if (!parsed.ok) return { ok: false, message: parsed.message };
  if (parsed.gstin !== firm.gstin) return { ok: false, message: `This GSTR-2B is for GSTIN ${parsed.gstin}, not ${firm.name} (${firm.gstin}).` };
  const { data: count, error: importError } = await supabase.rpc("import_gstr2b", {
    p_document: document.id, p_firm: firm.id, p_period: parsed.period, p_rows: parsed.rows as unknown as Json,
  });
  if (importError) return { ok: false, message: importError.code === "P0001" ? importError.message : "Import failed. Please retry." };
  revalidatePath("/app/accounts/gst");
  const period = `${parsed.period.slice(0, 2)}/${parsed.period.slice(2)}`;
  return { ok: true, message: `Imported ${count} documents for ${period}. Showing the match for that month below.` };
}
