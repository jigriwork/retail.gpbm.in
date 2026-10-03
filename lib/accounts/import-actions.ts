"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

import { requireFinance } from "@/lib/accounts/access";
import type { ColumnMap, ImportField } from "@/lib/accounts/format";
import { readSpreadsheet } from "@/lib/spreadsheets/read";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";


async function sheetRows(documentId: string) {
  const supabase = await createClient();
  const { data: document } = await supabase.from("finance_documents").select("file_path,file_name,mime_type,status").eq("id", documentId).maybeSingle();
  if (!document || !["stored", "reviewed"].includes(document.status)) throw new Error("Document not available.");
  if (!/sheet|excel|csv/.test(document.mime_type)) throw new Error("Choose an Excel or CSV document.");
  const { data: blob, error } = await supabase.storage.from("finance-docs").download(document.file_path, {}, { signal: AbortSignal.timeout(30000) });
  if (error || !blob) throw new Error("The document could not be read.");
  const workbook = await readSpreadsheet(new File([await blob.arrayBuffer()], document.file_name, { type: document.mime_type }));
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new Error("The workbook has no sheets.");
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { blankrows: false, defval: null, header: 1, raw: false });
}

/** First rows of a supplier item sheet or Logic export, to choose the header row and columns. */
export async function previewImportSheet(documentId: string, headerRow: number) {
  if (!(await requireFinance("post"))) return { ok: false as const, message: "You cannot import purchase lines." };
  try {
    const rows = await sheetRows(documentId);
    const index = Math.min(Math.max(1, headerRow), 50) - 1;
    const headers = (rows[index] ?? []).map((cell, column) => String(cell ?? "").trim() || `Column ${column + 1}`);
    return { ok: true as const, headers, rowCount: Math.max(0, rows.length - index - 1), sample: rows.slice(index + 1, index + 6).map((row) => row.map((cell) => (cell === null ? "" : String(cell)))) };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "Could not read the sheet." };
  }
}

const numberOrNull = (value: unknown) => {
  const text = String(value ?? "").replace(/[,₹\s]/g, "");
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
};
const textOrNull = (value: unknown, max: number) => {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
};
const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Adds lines from the sheet to a draft purchase. Nothing is guessed: a GST
 * class like "GST APPAREL" is not a rate, so it is left empty; tax is then
 * checked on the invoice total only.
 */
export async function importPurchaseLines(input: {
  invoiceId: string; documentId: string; headerRow: number; map: ColumnMap; replace: boolean; saveAs: string; kind: "item_sheet" | "purchase_export"; partyId: string;
}) {
  const session = await requireFinance("post");
  if (!session) return { ok: false, message: "You cannot import purchase lines." };
  if (!input.map.quantity || (!input.map.taxable_amount && !input.map.unit_rate)) {
    return { ok: false, message: "Map at least the quantity and either the taxable amount or the rate." };
  }
  const supabase = await createClient();
  const { data: invoice } = await supabase.from("purchase_invoices").select("id,status").eq("id", input.invoiceId).maybeSingle();
  if (!invoice || invoice.status !== "draft") return { ok: false, message: "Lines can only be added to a draft purchase." };
  let rows: unknown[][];
  try { rows = await sheetRows(input.documentId); } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not read." }; }
  const index = Math.min(Math.max(1, input.headerRow), 50) - 1;
  const headers = (rows[index] ?? []).map((cell, column) => String(cell ?? "").trim() || `Column ${column + 1}`);
  const column = (field: ImportField) => (input.map[field] ? headers.indexOf(input.map[field]!) : -1);
  const [{ data: brands }, { data: aliases }] = await Promise.all([
    supabase.from("brands").select("id,normalized").limit(5000),
    supabase.from("brand_aliases").select("brand_id,normalized").limit(10000),
  ]);
  const brandByName = new Map<string, string>([...(brands ?? []).map((brand) => [brand.normalized, brand.id] as [string, string]), ...(aliases ?? []).map((alias) => [alias.normalized, alias.brand_id] as [string, string])]);
  const unknownBrands = new Set<string>();
  const skipped: number[] = [];
  const lines = [];
  for (const [offset, row] of rows.slice(index + 1).entries()) {
    const get = (field: ImportField) => (column(field) >= 0 ? row[column(field)] : null);
    const qty = numberOrNull(get("quantity"));
    const rate = numberOrNull(get("unit_rate"));
    const taxable = numberOrNull(get("taxable_amount")) ?? (rate !== null && qty !== null ? Math.round(rate * qty * 100) / 100 : null);
    if (!qty || qty <= 0 || taxable === null) {
      if (row.some((cell) => String(cell ?? "").trim())) skipped.push(index + offset + 2);
      continue;
    }
    const brandText = textOrNull(get("brand"), 120);
    const brandId = brandText ? brandByName.get(norm(brandText)) ?? null : null;
    if (brandText && !brandId) unknownBrands.add(brandText);
    const gst = numberOrNull(get("gst_rate"));
    lines.push({
      article: textOrNull(get("article"), 120), barcode: textOrNull(get("barcode"), 40), brand_id: brandId, lot_code: textOrNull(get("lot_code"), 40),
      cgst_amount: numberOrNull(get("cgst_amount")) ?? 0, colour: textOrNull(get("colour"), 60), description: textOrNull(get("description"), 300),
      gst_rate: gst !== null && gst >= 0 && gst <= 40 ? gst : null, hsn_code: textOrNull(get("hsn"), 12),
      igst_amount: numberOrNull(get("igst_amount")) ?? 0, invoice_id: input.invoiceId, line_total: numberOrNull(get("line_total")),
      mrp: numberOrNull(get("mrp")), quantity: qty, sgst_amount: numberOrNull(get("sgst_amount")) ?? 0, size: textOrNull(get("size"), 40),
      source: input.kind, source_document_id: input.documentId, taxable_amount: Math.round(taxable * 100) / 100, unit_rate: rate,
    });
  }
  if (!lines.length) return { ok: false, message: "No usable lines were found. Check the header row and the quantity/amount columns." };
  if (lines.length > 3000) return { ok: false, message: "More than 3,000 lines. Split the sheet or contact the owner." };
  if (input.replace) {
    const { error } = await supabase.from("purchase_invoice_lines").delete().eq("invoice_id", input.invoiceId).gte("line_no", 0);
    if (error) return { ok: false, message: error.message };
  }
  const { data: last } = await supabase.from("purchase_invoice_lines").select("line_no").eq("invoice_id", input.invoiceId).order("line_no", { ascending: false }).limit(1);
  const start = last?.[0]?.line_no ?? 0;
  for (let i = 0; i < lines.length; i += 500) {
    const { error } = await supabase.from("purchase_invoice_lines").insert(lines.slice(i, i + 500).map((line, j) => ({ ...line, line_no: start + i + j + 1 })));
    if (error) return { ok: false, message: `Stopped at line ${i + 1}: ${error.message}` };
  }
  await supabase.from("document_links").upsert(
    { document_id: input.documentId, entity_id: input.invoiceId, entity_type: "purchase_invoice", linked_by: session.profile.id, role: "supporting" },
    { ignoreDuplicates: true, onConflict: "document_id,entity_type,entity_id" },
  );
  if (input.saveAs.trim()) {
    await supabase.from("purchase_import_profiles").insert({
      column_map: input.map as Json, created_by: session.profile.id, header_row: input.headerRow, kind: input.kind,
      name: input.saveAs.trim().slice(0, 120), party_id: input.partyId || null, verified: false,
    });
  }
  revalidatePath(`/app/accounts/purchases/${input.invoiceId}`);
  const notes = [
    `${lines.length} line${lines.length === 1 ? "" : "s"} added.`,
    skipped.length ? `${skipped.length} row(s) skipped without quantity/amount (sheet rows ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? "…" : ""}).` : "",
    unknownBrands.size ? `Brands not recognised, left blank: ${[...unknownBrands].slice(0, 6).join(", ")}. Link these spellings under Brands.` : "",
  ];
  return { ok: true, message: notes.filter(Boolean).join(" ") };
}
